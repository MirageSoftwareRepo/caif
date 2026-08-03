import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db";
import { clinicalNotes, appointments, doctors, patients, user, recordAccessRequests } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole } from "./_guards";
import { createNotification } from "./notifications.functions";
import { logClinicalAccess } from "./clinical-audit";

// Plan 10, §4ter. Acceso del admin a fichas clínicas: nunca pasivo, siempre
// por un camino explícito (Médicos → Dr. X → Pacientes → Ver ficha), con
// motivo obligatorio, auditado y notificado al autor. El admin no puede
// escribir, firmar ni agregar addenda por ninguna vía — estas funciones solo
// leen.

export const adminListDoctorPatients = createServerFn({ method: "POST" })
  .inputValidator(z.object({ doctorId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireRole("admin");
    const rows = await db
      .selectDistinct({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        documentNumber: patients.documentNumber,
      })
      .from(appointments)
      .innerJoin(user, eq(user.id, appointments.patientId))
      .leftJoin(patients, eq(patients.userId, appointments.patientId))
      .where(eq(appointments.doctorId, data.doctorId))
      .orderBy(user.lastName, user.firstName);
    return rows;
  });

export const adminListPatientNotes = createServerFn({ method: "POST" })
  .inputValidator(z.object({ doctorId: z.string().uuid(), patientId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireRole("admin");
    return db.query.clinicalNotes.findMany({
      where: and(eq(clinicalNotes.doctorId, data.doctorId), eq(clinicalNotes.patientId, data.patientId)),
      with: { specialty: true },
      orderBy: (n, { desc }) => [desc(n.sessionDate)],
    });
  });

// Motivo mínimo 15 caracteres (criterio de aceptación §4ter). Registra
// `ver_admin` en el log y notifica al autor de inmediato, con el motivo.
export const adminViewNote = createServerFn({ method: "POST" })
  .inputValidator(z.object({ noteId: z.string().uuid(), reason: z.string().min(15).max(500) }))
  .handler(async ({ data }) => {
    const session = await requireRole("admin");
    const note = await db.query.clinicalNotes.findFirst({
      where: eq(clinicalNotes.id, data.noteId),
      with: {
        addenda: { with: { author: { with: { user: true } } }, orderBy: (a, { asc }) => [asc(a.createdAt)] },
        doctor: { with: { user: true } },
        patient: true,
        specialty: true,
      },
    });
    if (!note) throw new Error("Nota no encontrada");

    await logClinicalAccess({
      actorUserId: session.user.id,
      patientId: note.patientId,
      noteId: note.id,
      action: "ver_admin",
      reason: data.reason,
    });

    await createNotification({
      userId: note.doctor.userId,
      title: "El administrador accedió a tu ficha",
      message: `El administrador accedió a tu ficha de ${note.patient.firstName} ${note.patient.lastName}. Motivo: ${data.reason}`,
    });

    return note;
  });

// §4bis, tramo admin: pedidos dirigidos a un médico inactivo sin sucesor
// asignado quedan para el admin. No aparecen acá los que sí tienen sucesor
// (esos los resuelve el sucesor como propios, ver record-access.functions.ts).
export const adminListOrphanedAccessRequests = createServerFn({ method: "POST" }).handler(async () => {
  await requireRole("admin");
  const rows = await db.query.recordAccessRequests.findMany({
    where: eq(recordAccessRequests.status, "pendiente"),
    with: {
      requester: { with: { user: true } },
      target: { with: { user: true } },
      patient: true,
      specialty: true,
    },
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });
  const orphaned = [];
  for (const r of rows) {
    if (!r.target?.isActive && !r.target?.successorDoctorId) orphaned.push(r);
  }
  return orphaned;
});

async function requireOrphanedRequest(requestId: string) {
  const request = await db.query.recordAccessRequests.findFirst({
    where: eq(recordAccessRequests.id, requestId),
    with: { target: true },
  });
  if (!request) throw new Error("Pedido no encontrado");
  if (request.status !== "pendiente") throw new Error("Este pedido ya fue resuelto");
  if (request.target?.isActive || request.target?.successorDoctorId) {
    throw new Error("Este pedido tiene un médico responsable activo, no le corresponde al admin");
  }
  return request;
}

export const adminApproveAccessRequest = createServerFn({ method: "POST" })
  .inputValidator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireRole("admin");
    const request = await requireOrphanedRequest(data.requestId);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [updated] = await db
      .update(recordAccessRequests)
      .set({ status: "aprobado", expiresAt, decidedAt: new Date(), decidedByUserId: session.user.id })
      .where(eq(recordAccessRequests.id, data.requestId))
      .returning();

    const requesterDoctor = await db.query.doctors.findFirst({
      where: eq(doctors.id, request.requesterDoctorId),
    });
    if (requesterDoctor) {
      await createNotification({
        userId: requesterDoctor.userId,
        title: "Pedido de acceso aprobado",
        message: `Tu pedido fue aprobado por el administrador. Podés leer las notas hasta el ${expiresAt.toLocaleDateString("es-AR")}.`,
        accessRequestId: request.id,
      });
    }
    await logClinicalAccess({
      actorUserId: session.user.id,
      patientId: request.patientId,
      action: "aprobar",
      viaRequestId: request.id,
    });

    return updated;
  });

export const adminRejectAccessRequest = createServerFn({ method: "POST" })
  .inputValidator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireRole("admin");
    const request = await requireOrphanedRequest(data.requestId);

    const [updated] = await db
      .update(recordAccessRequests)
      .set({ status: "rechazado", decidedAt: new Date(), decidedByUserId: session.user.id })
      .where(eq(recordAccessRequests.id, data.requestId))
      .returning();

    const requesterDoctor = await db.query.doctors.findFirst({
      where: eq(doctors.id, request.requesterDoctorId),
    });
    if (requesterDoctor) {
      await createNotification({
        userId: requesterDoctor.userId,
        title: "Pedido de acceso rechazado",
        message: "El administrador rechazó tu pedido de acceso a la historia clínica.",
        accessRequestId: request.id,
      });
    }
    await logClinicalAccess({
      actorUserId: session.user.id,
      patientId: request.patientId,
      action: "rechazar",
      viaRequestId: request.id,
    });

    return updated;
  });
