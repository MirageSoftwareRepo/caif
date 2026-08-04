import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db/index.server";
import {
  doctorTimeBlocks,
  appointments,
  doctorSchedules,
  user,
  account,
  patients,
} from "@/db/schema";
import { eq, and, gte, lt, ne } from "drizzle-orm";
import { requireDoctor, requireSession, AuthError } from "./_guards";
import { validateTimeBlock, BLOCK_ERROR_MESSAGES } from "@/lib/time-blocks";
import { hashPassword } from "@/lib/password";

function dayBounds(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return {
    dayStart: new Date(year, month - 1, day, 0, 0, 0, 0),
    dayEnd: new Date(year, month - 1, day, 23, 59, 59, 999),
  };
}

export const createTimeBlock = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
      reason: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { session, doctorId } = await requireDoctor();
    const start = new Date(data.startAt);
    const end = new Date(data.endAt);

    const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      23,
      59,
      59,
      999,
    );

    const [schedule, dayAppointments, dayBlocks] = await Promise.all([
      db.query.doctorSchedules.findMany({ where: eq(doctorSchedules.doctorId, doctorId) }),
      db
        .select({
          scheduledAt: appointments.scheduledAt,
          durationMinutes: appointments.durationMinutes,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.doctorId, doctorId),
            gte(appointments.scheduledAt, dayStart),
            lt(appointments.scheduledAt, dayEnd),
            ne(appointments.status, "cancelado"),
          ),
        ),
      db
        .select({ startAt: doctorTimeBlocks.startAt, endAt: doctorTimeBlocks.endAt })
        .from(doctorTimeBlocks)
        .where(
          and(
            eq(doctorTimeBlocks.doctorId, doctorId),
            gte(doctorTimeBlocks.startAt, dayStart),
            lt(doctorTimeBlocks.startAt, dayEnd),
          ),
        ),
    ]);

    const error = validateTimeBlock({
      start,
      end,
      schedule,
      appointments: dayAppointments.map((a) => ({
        start: new Date(a.scheduledAt),
        end: new Date(new Date(a.scheduledAt).getTime() + (a.durationMinutes ?? 30) * 60_000),
      })),
      blocks: dayBlocks.map((b) => ({ start: new Date(b.startAt), end: new Date(b.endAt) })),
    });

    if (error) throw new Error(BLOCK_ERROR_MESSAGES[error]);

    const [block] = await db
      .insert(doctorTimeBlocks)
      .values({
        doctorId,
        startAt: start,
        endAt: end,
        reason: data.reason ?? null,
        createdByUserId: session.user.id,
      })
      .returning({ id: doctorTimeBlocks.id });

    return { id: block.id };
  });

export const getMyTimeBlocks = createServerFn({ method: "POST" })
  .inputValidator(z.object({ from: z.string(), to: z.string() }))
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();
    const { dayStart } = dayBounds(data.from);
    const { dayEnd } = dayBounds(data.to);

    return db
      .select({
        id: doctorTimeBlocks.id,
        startAt: doctorTimeBlocks.startAt,
        endAt: doctorTimeBlocks.endAt,
        reason: doctorTimeBlocks.reason,
      })
      .from(doctorTimeBlocks)
      .where(
        and(
          eq(doctorTimeBlocks.doctorId, doctorId),
          gte(doctorTimeBlocks.startAt, dayStart),
          lt(doctorTimeBlocks.startAt, dayEnd),
        ),
      );
  });

// Usada por pacientes y recepcion para calcular disponibilidad. Devuelve solo el
// rango horario: `reason` puede tener datos del paciente extraparticular y no
// debe salir de la sesion del medico.
export const getDoctorTimeBlocks = createServerFn({ method: "POST" })
  .inputValidator(z.object({ doctorId: z.string().uuid(), date: z.string() }))
  .handler(async ({ data }) => {
    await requireSession();
    const { dayStart, dayEnd } = dayBounds(data.date);

    return db
      .select({ startAt: doctorTimeBlocks.startAt, endAt: doctorTimeBlocks.endAt })
      .from(doctorTimeBlocks)
      .where(
        and(
          eq(doctorTimeBlocks.doctorId, data.doctorId),
          gte(doctorTimeBlocks.startAt, dayStart),
          lt(doctorTimeBlocks.startAt, dayEnd),
        ),
      );
  });

export const deleteTimeBlock = createServerFn({ method: "POST" })
  .inputValidator(z.object({ blockId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();
    const block = await db.query.doctorTimeBlocks.findFirst({
      where: eq(doctorTimeBlocks.id, data.blockId),
      columns: { doctorId: true },
    });
    if (!block) throw new Error("Bloqueo no encontrado");
    if (block.doctorId !== doctorId) throw new AuthError("FORBIDDEN", "No autorizado");

    await db.delete(doctorTimeBlocks).where(eq(doctorTimeBlocks.id, data.blockId));
    return { success: true };
  });

// Alta rapida de un paciente extraparticular sobre un bloqueo existente. El bloqueo
// se PROMUEVE a turno real (status completado) y se elimina, de modo que la ficha
// clinica posterior no necesita ninguna rama especial: cuelga de un appointment
// como cualquier otra. Ver docs/10-modulo-clinico.md §8.
export const promoteBlockToAppointment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      blockId: z.string().uuid(),
      firstName: z.string().min(1).max(80),
      lastName: z.string().min(1).max(80),
      documentNumber: z.string().min(6).max(15).regex(/^\d+$/, "El DNI debe ser numérico"),
      phone: z.string().min(6).max(30),
      specialtyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();

    const block = await db.query.doctorTimeBlocks.findFirst({
      where: eq(doctorTimeBlocks.id, data.blockId),
    });
    if (!block) throw new Error("Bloqueo no encontrado");
    if (block.doctorId !== doctorId) throw new AuthError("FORBIDDEN", "No autorizado");

    const existingPatient = await db.query.patients.findFirst({
      where: eq(patients.documentNumber, data.documentNumber),
    });

    const durationMinutes = Math.max(
      1,
      Math.round((block.endAt.getTime() - block.startAt.getTime()) / 60_000),
    );

    return db.transaction(async (tx) => {
      let patientUserId: string;

      if (existingPatient) {
        // El paciente ya existe: se reutiliza, no se duplica ni se pisa nada.
        patientUserId = existingPatient.userId;
      } else {
        const userId = crypto.randomUUID();
        // `user.email` es notNull unique y el alta rapida no pide email. Se deriva
        // del DNI en un dominio interno que no resuelve, para que nunca se le mande
        // correo. `isActive: false` deja la cuenta sin poder iniciar sesion hasta que
        // la recepcion la complete. Esto NO toca el login de pacientes.
        const placeholderEmail = `dni-${data.documentNumber}@caif.local`;
        const passwordHash = await hashPassword(crypto.randomUUID());

        await tx.insert(user).values({
          id: userId,
          email: placeholderEmail,
          firstName: data.firstName,
          lastName: data.lastName,
          name: `${data.firstName} ${data.lastName}`,
          phone: data.phone,
          role: "paciente",
          mustChangePassword: true,
          isActive: false,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await tx.insert(account).values({
          id: crypto.randomUUID(),
          userId,
          accountId: placeholderEmail,
          providerId: "credential",
          password: passwordHash,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await tx.insert(patients).values({
          userId,
          documentNumber: data.documentNumber,
        });

        patientUserId = userId;
      }

      const [appointment] = await tx
        .insert(appointments)
        .values({
          patientId: patientUserId,
          doctorId,
          specialtyId: data.specialtyId,
          scheduledAt: block.startAt,
          durationMinutes,
          status: "completado",
          notes: block.reason ?? null,
        })
        .returning({ id: appointments.id });

      await tx.delete(doctorTimeBlocks).where(eq(doctorTimeBlocks.id, data.blockId));

      return { appointmentId: appointment.id, patientUserId };
    });
  });
