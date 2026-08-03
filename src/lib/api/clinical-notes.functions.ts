import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db";
import { clinicalNotes, clinicalNoteAddenda, appointments, doctors, user, patients } from "@/db/schema";
import { eq, and, inArray, desc, or, ilike } from "drizzle-orm";
import { requireDoctor, requireSession, AuthError } from "./_guards";
import {
  canReadNote,
  canWriteNote,
  canSignNote,
  type ClinicalActor,
} from "@/lib/clinical-permissions";
import { sanitizeClinicalHtml, deriveBodyText } from "@/lib/clinical-html.server";
import { getDoctorSpecialtyIds } from "./db-helpers";
import { getActiveGrantsForDoctor } from "./record-access.functions";
import { logClinicalAccess } from "./clinical-audit";
import { generateClinicalNotePDF } from "@/lib/pdf-generate";

function toActor(doctorId: string, specialtyIds: string[]): ClinicalActor {
  return { kind: "doctor", doctorId, specialtyIds };
}

// Crea el borrador de la sesión al abrir un turno, o devuelve el existente si
// ya se había abierto antes: "una nota por turno" (docs/10-modulo-clinico.md §1),
// sin índice único a propósito — ver el comentario en schema.ts.
export const createOrGetDraftFromAppointment = createServerFn({ method: "POST" })
  .inputValidator(z.object({ appointmentId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();

    const appointment = await db.query.appointments.findFirst({
      where: eq(appointments.id, data.appointmentId),
    });
    if (!appointment) throw new Error("Turno no encontrado");
    if (appointment.doctorId !== doctorId) throw new AuthError("FORBIDDEN", "No autorizado");

    const existing = await db.query.clinicalNotes.findFirst({
      where: eq(clinicalNotes.appointmentId, data.appointmentId),
    });
    if (existing) return existing;

    const [note] = await db
      .insert(clinicalNotes)
      .values({
        patientId: appointment.patientId,
        doctorId,
        specialtyId: appointment.specialtyId,
        appointmentId: appointment.id,
        sessionDate: appointment.scheduledAt,
      })
      .returning();
    return note;
  });

export const autosaveNote = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      noteId: z.string().uuid(),
      motivo: z.string().max(2000).optional(),
      diagnostico: z.string().max(2000).optional(),
      proximoControl: z.string().datetime().nullable().optional(),
      bodyHtml: z.string().max(200_000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();
    const note = await db.query.clinicalNotes.findFirst({
      where: eq(clinicalNotes.id, data.noteId),
    });
    if (!note) throw new Error("Nota no encontrada");

    const actor = toActor(doctorId, []);
    if (!canWriteNote(actor, note)) {
      throw new AuthError("FORBIDDEN", "Esta nota no se puede editar");
    }

    const sanitizedHtml =
      data.bodyHtml !== undefined ? sanitizeClinicalHtml(data.bodyHtml) : undefined;

    const [updated] = await db
      .update(clinicalNotes)
      .set({
        motivo: data.motivo,
        diagnostico: data.diagnostico,
        proximoControl:
          data.proximoControl === undefined
            ? undefined
            : data.proximoControl === null
              ? null
              : new Date(data.proximoControl),
        bodyHtml: sanitizedHtml,
        bodyText: sanitizedHtml !== undefined ? deriveBodyText(sanitizedHtml) : undefined,
        updatedAt: new Date(),
      })
      // Doble chequeo de estado en el WHERE: si la nota se firmó entre el
      // findFirst y este update, la fila no matchea y no se pisa nada.
      .where(and(eq(clinicalNotes.id, data.noteId), eq(clinicalNotes.status, "borrador")))
      .returning();

    if (!updated) throw new AuthError("FORBIDDEN", "Esta nota ya no se puede editar");
    return updated;
  });

export const signNote = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      noteId: z.string().uuid(),
      patientVisibility: z.enum(["visible", "en_consulta"]),
    }),
  )
  .handler(async ({ data }) => {
    const { session, doctorId } = await requireDoctor();
    const note = await db.query.clinicalNotes.findFirst({
      where: eq(clinicalNotes.id, data.noteId),
    });
    if (!note) throw new Error("Nota no encontrada");

    const actor = toActor(doctorId, []);
    if (!canSignNote(actor, note)) {
      throw new AuthError("FORBIDDEN", "Esta nota no se puede firmar");
    }

    const [signed] = await db
      .update(clinicalNotes)
      .set({
        status: "firmada",
        signedAt: new Date(),
        signedByUserId: session.user.id,
        patientVisibility: data.patientVisibility,
        releasedToPatientAt: data.patientVisibility === "visible" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(clinicalNotes.id, data.noteId), eq(clinicalNotes.status, "borrador")))
      .returning();

    if (!signed) throw new AuthError("FORBIDDEN", "Esta nota ya fue firmada");

    await logClinicalAccess({
      actorUserId: session.user.id,
      patientId: signed.patientId,
      noteId: signed.id,
      action: "firmar",
    });

    return signed;
  });

// Corrección post-firma. Cualquier doctor con acceso de lectura a la nota
// (autor, misma especialidad, o vía grant aprobado) puede agregar un
// addendum con su propia autoría — la nota original nunca se toca.
export const addAddendum = createServerFn({ method: "POST" })
  .inputValidator(z.object({ noteId: z.string().uuid(), bodyHtml: z.string().min(1).max(50_000) }))
  .handler(async ({ data }) => {
    const { session, doctorId } = await requireDoctor();
    const note = await db.query.clinicalNotes.findFirst({
      where: eq(clinicalNotes.id, data.noteId),
    });
    if (!note) throw new Error("Nota no encontrada");
    if (note.status !== "firmada") {
      throw new Error("Solo se pueden agregar addenda a notas firmadas");
    }

    const [specialtyIds, grants] = await Promise.all([
      getDoctorSpecialtyIds(doctorId),
      getActiveGrantsForDoctor(doctorId),
    ]);
    const actor = toActor(doctorId, specialtyIds);
    if (!canReadNote(actor, note, grants, new Date())) {
      throw new AuthError("FORBIDDEN", "No autorizado");
    }

    const sanitizedHtml = sanitizeClinicalHtml(data.bodyHtml);
    const [addendum] = await db
      .insert(clinicalNoteAddenda)
      .values({
        noteId: data.noteId,
        authorDoctorId: doctorId,
        bodyHtml: sanitizedHtml,
        bodyText: deriveBodyText(sanitizedHtml),
      })
      .returning();

    await logClinicalAccess({
      actorUserId: session.user.id,
      patientId: note.patientId,
      noteId: note.id,
      action: "addendum",
    });

    return addendum;
  });

// Pacientes con turnos con este médico, para armar la lista de la izquierda
// del panel clínico (mismo criterio que ArchivosTab).
export const getClinicalPatients = createServerFn({ method: "POST" }).handler(async () => {
  const { doctorId } = await requireDoctor();
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
    .where(eq(appointments.doctorId, doctorId))
    .orderBy(user.lastName, user.firstName);
  return rows;
});

// Timeline de un paciente para el médico logueado, ya filtrado por el
// predicado de permisos (propia + misma especialidad; grants llegan en Fase 3).
// `q` filtra por motivo/diagnóstico/cuerpo (búsqueda simple con ILIKE mientras
// no exista el índice GIN — volumen de una clínica chica, ver docs/10-modulo-clinico.md).
export const listPatientTimeline = createServerFn({ method: "POST" })
  .inputValidator(z.object({ patientId: z.string(), q: z.string().max(200).optional() }))
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();
    const [specialtyIds, grants] = await Promise.all([
      getDoctorSpecialtyIds(doctorId),
      getActiveGrantsForDoctor(doctorId),
    ]);
    const actor = toActor(doctorId, specialtyIds);
    const now = new Date();

    // Especialidades habilitadas por un grant vigente y aprobado sobre ESTE
    // paciente, para poder sumarlas al WHERE (el predicado puro recién se
    // aplica después, como defensa en profundidad).
    const grantedSpecialtyIds = grants
      .filter(
        (g) =>
          g.patientId === data.patientId &&
          g.status === "aprobado" &&
          (g.expiresAt === null || g.expiresAt.getTime() > now.getTime()),
      )
      .map((g) => g.specialtyId);

    const visibleSpecialtyIds = [...specialtyIds, ...grantedSpecialtyIds];
    const visibilityCondition =
      visibleSpecialtyIds.length > 0
        ? or(eq(clinicalNotes.doctorId, doctorId), inArray(clinicalNotes.specialtyId, visibleSpecialtyIds))
        : eq(clinicalNotes.doctorId, doctorId);

    const conditions = [eq(clinicalNotes.patientId, data.patientId), visibilityCondition];
    if (data.q?.trim()) {
      const term = `%${data.q.trim()}%`;
      conditions.push(
        or(
          ilike(clinicalNotes.motivo, term),
          ilike(clinicalNotes.diagnostico, term),
          ilike(clinicalNotes.bodyText, term),
        )!,
      );
    }

    const notes = await db.query.clinicalNotes.findMany({
      where: and(...conditions),
      with: {
        doctor: { with: { user: true } },
        specialty: true,
        addenda: {
          with: { author: { with: { user: true } } },
          orderBy: (a, { asc }) => [asc(a.createdAt)],
        },
      },
      orderBy: [desc(clinicalNotes.sessionDate)],
    });

    // Defensa en profundidad: aunque el WHERE ya filtra por especialidad,
    // se re-verifica con el predicado puro para no depender de una sola capa.
    return notes.filter((n) =>
      canReadNote(
        actor,
        {
          patientId: n.patientId,
          doctorId: n.doctorId,
          specialtyId: n.specialtyId,
          status: n.status,
          patientVisibility: n.patientVisibility,
          releasedToPatientAt: n.releasedToPatientAt,
        },
        grants,
        now,
      ),
    );
  });

export const getNote = createServerFn({ method: "POST" })
  .inputValidator(z.object({ noteId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { session, doctorId } = await requireDoctor();
    const note = await db.query.clinicalNotes.findFirst({
      where: eq(clinicalNotes.id, data.noteId),
      with: {
        addenda: {
          with: { author: { with: { user: true } } },
          orderBy: (a, { asc }) => [asc(a.createdAt)],
        },
      },
    });
    if (!note) throw new Error("Nota no encontrada");

    const [specialtyIds, grants] = await Promise.all([
      getDoctorSpecialtyIds(doctorId),
      getActiveGrantsForDoctor(doctorId),
    ]);
    const actor = toActor(doctorId, specialtyIds);
    if (!canReadNote(actor, note, grants, new Date())) {
      throw new AuthError("FORBIDDEN", "No autorizado");
    }

    if (note.doctorId !== doctorId) {
      // Si no comparte especialidad, la lectura solo pudo pasar por un grant:
      // se busca el pedido aprobado que la habilita para dejarlo en el log
      // (criterio de aceptación: "cada lectura vía permiso queda con viaRequestId").
      let viaRequestId: string | undefined;
      if (!specialtyIds.includes(note.specialtyId)) {
        const grantRow = await db.query.recordAccessRequests.findFirst({
          where: (r, { eq, and }) =>
            and(
              eq(r.requesterDoctorId, doctorId),
              eq(r.patientId, note.patientId),
              eq(r.specialtyId, note.specialtyId),
              eq(r.status, "aprobado"),
            ),
          columns: { id: true },
        });
        viaRequestId = grantRow?.id;
      }
      await logClinicalAccess({
        actorUserId: session.user.id,
        patientId: note.patientId,
        noteId: note.id,
        action: "ver",
        viaRequestId,
      });
    }

    return note;
  });

// Plan 10, Fase 4. Historia clínica del paciente: solo notas firmadas y
// liberadas (D7/D8), sin importar qué doctor las escribió. El predicado puro
// ya codifica esta regla para el actor "patient"; acá se aplica igual, como
// única fuente de verdad, en vez de reimplementar el filtro a mano.
export const getMyClinicalHistory = createServerFn({ method: "POST" }).handler(async () => {
  const session = await requireSession();
  const notes = await db.query.clinicalNotes.findMany({
    where: eq(clinicalNotes.patientId, session.user.id),
    with: {
      doctor: { with: { user: true } },
      specialty: true,
      addenda: {
        with: { author: { with: { user: true } } },
        orderBy: (a, { asc }) => [asc(a.createdAt)],
      },
    },
    orderBy: [desc(clinicalNotes.sessionDate)],
  });

  const actor: ClinicalActor = { kind: "patient", userId: session.user.id };
  const now = new Date();
  return notes.filter((n) => canReadNote(actor, n, [], now));
});

// El médico libera una nota marcada "entregar en consulta" cuando corresponde
// (D8). Solo el autor, y solo después de firmada — antes de firmar no hay
// nada que liberar.
export const releaseNoteToPatient = createServerFn({ method: "POST" })
  .inputValidator(z.object({ noteId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { session, doctorId } = await requireDoctor();
    const note = await db.query.clinicalNotes.findFirst({
      where: eq(clinicalNotes.id, data.noteId),
    });
    if (!note) throw new Error("Nota no encontrada");
    if (note.doctorId !== doctorId) throw new AuthError("FORBIDDEN", "No autorizado");
    if (note.status !== "firmada") throw new Error("Solo se puede liberar una nota firmada");

    const [updated] = await db
      .update(clinicalNotes)
      .set({ releasedToPatientAt: new Date(), updatedAt: new Date() })
      .where(eq(clinicalNotes.id, data.noteId))
      .returning();

    await logClinicalAccess({
      actorUserId: session.user.id,
      patientId: note.patientId,
      noteId: note.id,
      action: "liberar",
    });

    return updated;
  });

// Plan 10, Fase 6 (paso 30/31). Exporta una nota a PDF, disponible tanto para
// el médico (con el mismo predicado que getNote) como para el paciente dueño
// de la nota (§9: "Descarga en PDF de cada nota"). Cada exportación queda
// registrada como "imprimir" en la auditoría.
export const exportNotePdf = createServerFn({ method: "POST" })
  .inputValidator(z.object({ noteId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const note = await db.query.clinicalNotes.findFirst({
      where: eq(clinicalNotes.id, data.noteId),
      with: {
        doctor: { with: { user: true } },
        patient: true,
        specialty: true,
        addenda: {
          with: { author: { with: { user: true } } },
          orderBy: (a, { asc }) => [asc(a.createdAt)],
        },
      },
    });
    if (!note) throw new Error("Nota no encontrada");

    let actor: ClinicalActor;
    if (session.user.role === "medico") {
      const doctor = await db.query.doctors.findFirst({ where: eq(doctors.userId, session.user.id) });
      if (!doctor) throw new AuthError("FORBIDDEN", "No autorizado");
      const [specialtyIds, grants] = await Promise.all([
        getDoctorSpecialtyIds(doctor.id),
        getActiveGrantsForDoctor(doctor.id),
      ]);
      actor = toActor(doctor.id, specialtyIds);
      if (!canReadNote(actor, note, grants, new Date())) {
        throw new AuthError("FORBIDDEN", "No autorizado");
      }
    } else {
      actor = { kind: "patient", userId: session.user.id };
      if (!canReadNote(actor, note, [], new Date())) {
        throw new AuthError("FORBIDDEN", "No autorizado");
      }
    }

    const pdfBuffer = await generateClinicalNotePDF({
      patientName: `${note.patient.firstName} ${note.patient.lastName}`,
      doctorName: `${note.doctor.user.firstName} ${note.doctor.user.lastName}`,
      specialtyName: note.specialty.name,
      sessionDate: note.sessionDate,
      motivo: note.motivo,
      diagnostico: note.diagnostico,
      bodyText: note.bodyText,
      signedAt: note.signedAt,
      addenda: note.addenda.map((a) => ({
        authorName: `${a.author.user.firstName} ${a.author.user.lastName}`,
        createdAt: a.createdAt,
        bodyText: a.bodyText,
      })),
    });

    await logClinicalAccess({
      actorUserId: session.user.id,
      patientId: note.patientId,
      noteId: note.id,
      action: "imprimir",
    });

    return {
      fileData: pdfBuffer.toString("base64"),
      fileName: `nota-clinica-${new Date(note.sessionDate).toISOString().slice(0, 10)}.pdf`,
    };
  });
