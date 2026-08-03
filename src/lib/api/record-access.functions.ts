import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db";
import { recordAccessRequests, doctors, user } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireDoctor, AuthError } from "./_guards";
import { createNotification } from "./notifications.functions";
import { logClinicalAccess } from "./clinical-audit";
import type { Grant } from "@/lib/clinical-permissions";

const GRANT_DAYS = 30; // D17

// Un médico inactivo no puede resolver pedidos: si tiene sucesor asignado
// (misma especialidad, D16), el pedido se enruta a él; si no, queda para el
// admin (implementado en admin-doctors.functions.ts, §4bis).
async function resolveEffectiveApproverDoctorId(targetDoctorId: string): Promise<string | null> {
  const target = await db.query.doctors.findFirst({
    where: eq(doctors.id, targetDoctorId),
    columns: { isActive: true, successorDoctorId: true },
  });
  if (!target) return null;
  if (target.isActive) return targetDoctorId;
  return target.successorDoctorId ?? null;
}

async function notifyDoctor(
  doctorId: string,
  payload: { title: string; message: string; accessRequestId?: string },
) {
  const doctor = await db.query.doctors.findFirst({
    where: eq(doctors.id, doctorId),
    columns: { userId: true },
  });
  if (!doctor) return;
  await createNotification({ userId: doctor.userId, ...payload });
}

export const requestRecordAccess = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      targetDoctorId: z.string().uuid(),
      patientId: z.string().min(1),
      specialtyId: z.string().uuid(),
      reason: z.string().min(1).max(500),
    }),
  )
  .handler(async ({ data }) => {
    const { session, doctorId } = await requireDoctor();
    if (data.targetDoctorId === doctorId) {
      throw new Error("No podés pedirte acceso a vos mismo");
    }

    const [request] = await db
      .insert(recordAccessRequests)
      .values({
        requesterDoctorId: doctorId,
        targetDoctorId: data.targetDoctorId,
        patientId: data.patientId,
        specialtyId: data.specialtyId,
        reason: data.reason,
      })
      .returning();

    const [requester, patient] = await Promise.all([
      db.query.doctors.findFirst({ where: eq(doctors.id, doctorId), with: { user: true } }),
      db.query.user.findFirst({ where: eq(user.id, data.patientId) }),
    ]);

    const approverId = await resolveEffectiveApproverDoctorId(data.targetDoctorId);
    if (approverId) {
      await notifyDoctor(approverId, {
        title: "Pedido de acceso a historia clínica",
        message: `${requester?.user.firstName ?? "Un colega"} ${requester?.user.lastName ?? ""} pidió acceso a las notas de ${patient?.firstName ?? "un paciente"} ${patient?.lastName ?? ""}. Motivo: ${data.reason}`,
        accessRequestId: request.id,
      });
    }

    await logClinicalAccess({
      actorUserId: session.user.id,
      patientId: data.patientId,
      action: "solicitar",
      viaRequestId: request.id,
      reason: data.reason,
    });

    return request;
  });

// Todos los estados, no solo pendientes: además de aprobar/rechazar, el
// destino necesita ver los que ya aprobó para poder revocarlos (D4).
export const listIncomingAccessRequests = createServerFn({ method: "POST" }).handler(async () => {
  const { doctorId } = await requireDoctor();
  const rows = await db.query.recordAccessRequests.findMany({
    where: eq(recordAccessRequests.targetDoctorId, doctorId),
    with: {
      requester: { with: { user: true } },
      patient: true,
      specialty: true,
    },
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });
  return rows;
});

export const listOutgoingAccessRequests = createServerFn({ method: "POST" }).handler(async () => {
  const { doctorId } = await requireDoctor();
  const rows = await db.query.recordAccessRequests.findMany({
    where: eq(recordAccessRequests.requesterDoctorId, doctorId),
    with: {
      target: { with: { user: true } },
      patient: true,
      specialty: true,
    },
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });
  return rows;
});

async function requireApproverAccess(requestId: string) {
  const { session, doctorId } = await requireDoctor();
  const request = await db.query.recordAccessRequests.findFirst({
    where: eq(recordAccessRequests.id, requestId),
  });
  if (!request) throw new Error("Pedido no encontrado");

  const approverId = await resolveEffectiveApproverDoctorId(request.targetDoctorId);
  if (approverId !== doctorId) throw new AuthError("FORBIDDEN", "No autorizado");
  if (request.status !== "pendiente") throw new Error("Este pedido ya fue resuelto");

  return { session, request };
}

export const approveAccessRequest = createServerFn({ method: "POST" })
  .inputValidator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { session, request } = await requireApproverAccess(data.requestId);

    const expiresAt = new Date(Date.now() + GRANT_DAYS * 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(recordAccessRequests)
      .set({
        status: "aprobado",
        expiresAt,
        decidedAt: new Date(),
        decidedByUserId: session.user.id,
      })
      .where(eq(recordAccessRequests.id, data.requestId))
      .returning();

    await notifyDoctor(request.requesterDoctorId, {
      title: "Pedido de acceso aprobado",
      message: `Tu pedido de acceso fue aprobado. Podés leer las notas hasta el ${expiresAt.toLocaleDateString("es-AR")}.`,
      accessRequestId: request.id,
    });
    await logClinicalAccess({
      actorUserId: session.user.id,
      patientId: request.patientId,
      action: "aprobar",
      viaRequestId: request.id,
    });

    return updated;
  });

export const rejectAccessRequest = createServerFn({ method: "POST" })
  .inputValidator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { session, request } = await requireApproverAccess(data.requestId);

    const [updated] = await db
      .update(recordAccessRequests)
      .set({ status: "rechazado", decidedAt: new Date(), decidedByUserId: session.user.id })
      .where(eq(recordAccessRequests.id, data.requestId))
      .returning();

    await notifyDoctor(request.requesterDoctorId, {
      title: "Pedido de acceso rechazado",
      message: "Tu pedido de acceso a la historia clínica fue rechazado.",
      accessRequestId: request.id,
    });
    await logClinicalAccess({
      actorUserId: session.user.id,
      patientId: request.patientId,
      action: "rechazar",
      viaRequestId: request.id,
    });

    return updated;
  });

// El autor (target) puede revocar en cualquier momento, sin dar explicaciones,
// incluso después de aprobado. Un permiso revocado corta la lectura en la
// siguiente request (docs/10-modulo-clinico.md §4).
export const revokeAccessRequest = createServerFn({ method: "POST" })
  .inputValidator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { session, doctorId } = await requireDoctor();
    const request = await db.query.recordAccessRequests.findFirst({
      where: eq(recordAccessRequests.id, data.requestId),
    });
    if (!request) throw new Error("Pedido no encontrado");

    const approverId = await resolveEffectiveApproverDoctorId(request.targetDoctorId);
    if (approverId !== doctorId) throw new AuthError("FORBIDDEN", "No autorizado");

    const [updated] = await db
      .update(recordAccessRequests)
      .set({ status: "revocado", decidedAt: new Date(), decidedByUserId: session.user.id })
      .where(eq(recordAccessRequests.id, data.requestId))
      .returning();

    await notifyDoctor(request.requesterDoctorId, {
      title: "Acceso revocado",
      message: "Se revocó tu acceso a esta historia clínica.",
      accessRequestId: request.id,
    });
    await logClinicalAccess({
      actorUserId: session.user.id,
      patientId: request.patientId,
      action: "revocar",
      viaRequestId: request.id,
    });

    return updated;
  });

// Descubrimiento cross-especialidad (D3): especialidades con turnos de este
// paciente que NO están entre las del médico logueado, con el nombre del
// profesional. Sin conteo, sin fechas, sin diagnósticos — a propósito.
export const getOtherSpecialtiesForPatient = createServerFn({ method: "POST" })
  .inputValidator(z.object({ patientId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();
    const myRows = await db.query.doctors.findFirst({
      where: eq(doctors.id, doctorId),
      with: { specialties: true },
    });
    const mySpecialtyIds = new Set((myRows?.specialties ?? []).map((s) => s.specialtyId));

    const rows = await db.query.appointments.findMany({
      where: (a, { eq }) => eq(a.patientId, data.patientId),
      with: { specialty: true, doctor: { with: { user: true } } },
    });

    const seen = new Map<string, { specialtyId: string; specialtyName: string; doctorId: string; doctorName: string }>();
    for (const r of rows) {
      if (mySpecialtyIds.has(r.specialtyId) || r.doctorId === doctorId) continue;
      const key = `${r.specialtyId}:${r.doctorId}`;
      if (!seen.has(key)) {
        seen.set(key, {
          specialtyId: r.specialtyId,
          specialtyName: r.specialty?.name ?? "—",
          doctorId: r.doctorId,
          doctorName: `${r.doctor?.user?.firstName ?? ""} ${r.doctor?.user?.lastName ?? ""}`.trim(),
        });
      }
    }
    return Array.from(seen.values());
  });

// Grants vigentes de un médico como GRANTEE, en el shape que pide el
// predicado puro (clinical-permissions.ts). No filtra por fecha acá: el
// predicado evalúa expiresAt contra `now` en el momento de leer.
export async function getActiveGrantsForDoctor(doctorId: string): Promise<Grant[]> {
  const rows = await db
    .select({
      targetDoctorId: recordAccessRequests.targetDoctorId,
      patientId: recordAccessRequests.patientId,
      specialtyId: recordAccessRequests.specialtyId,
      status: recordAccessRequests.status,
      expiresAt: recordAccessRequests.expiresAt,
      requesterDoctorId: recordAccessRequests.requesterDoctorId,
    })
    .from(recordAccessRequests)
    .where(and(eq(recordAccessRequests.requesterDoctorId, doctorId), eq(recordAccessRequests.status, "aprobado")));

  // El predicado espera `targetDoctorId` = el doctor que está leyendo (el
  // requester acá); se remapea para no acoplar el shape de la tabla al de Grant.
  return rows.map((r) => ({
    targetDoctorId: r.requesterDoctorId,
    patientId: r.patientId,
    specialtyId: r.specialtyId,
    status: r.status,
    expiresAt: r.expiresAt,
  }));
}

