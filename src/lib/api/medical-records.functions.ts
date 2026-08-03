import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db";
import { medicalRecords, doctors, doctorSpecialties, patients, user } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireDoctor, requireSession, AuthError } from "./_guards";
import { fileStorage } from "@/lib/storage.server";
import { getDoctorSpecialtyIds } from "./db-helpers";
import { logClinicalAccess } from "./clinical-audit";

// El campo legacy doctors.specialtyId queda null para los médicos dados de
// alta por el panel de admin (que solo escribe en doctor_specialties, la
// tabla-junction que soporta multi-especialidad). Se prioriza la junction y
// se cae al campo legacy solo si un médico no tiene ninguna fila ahí.
async function resolveDoctorSpecialtyIds(doctorId: string): Promise<string[]> {
  const viaJunction = await getDoctorSpecialtyIds(doctorId);
  if (viaJunction.length > 0) return viaJunction;
  const legacy = await db.query.doctors.findFirst({
    where: eq(doctors.id, doctorId),
    columns: { specialtyId: true },
  });
  return legacy?.specialtyId ? [legacy.specialtyId] : [];
}

export const uploadMedicalRecord = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      doctorId: z.string().uuid(),
      patientId: z.string(),
      fileName: z.string().min(1),
      fileType: z.string().min(1),
      fileData: z.string().min(1),
      fileSize: z
        .number()
        .int()
        .max(20 * 1024 * 1024),
    }),
  )
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();
    if (data.doctorId !== doctorId) throw new AuthError("FORBIDDEN", "No autorizado");
    const lastVersion = await db
      .select({ maxVersion: sql<number>`coalesce(max(${medicalRecords.recordVersion}), 0)` })
      .from(medicalRecords)
      .where(
        and(
          eq(medicalRecords.doctorId, data.doctorId),
          eq(medicalRecords.patientId, data.patientId),
        ),
      )
      .then((r) => r[0]?.maxVersion ?? 0);

    const storagePath = await fileStorage.saveFile("records", Buffer.from(data.fileData, "base64"));

    // Especialidad al momento de subir (Plan 10, §1 / D2): se copia de la
    // especialidad del médico y no se recalcula después, igual que specialtyId
    // en clinical_notes. Un médico con varias especialidades no tiene forma de
    // elegir cuál acá (no hay UI para eso todavía); se usa la primera.
    const [uploaderSpecialtyId] = await resolveDoctorSpecialtyIds(data.doctorId);

    const [record] = await db
      .insert(medicalRecords)
      .values({
        doctorId: data.doctorId,
        patientId: data.patientId,
        fileName: data.fileName,
        fileType: data.fileType,
        storagePath,
        fileSize: data.fileSize,
        recordVersion: lastVersion + 1,
        specialtyId: uploaderSpecialtyId ?? null,
      })
      .returning();
    return record;
  });

// Aislamiento por especialidad (Plan 10, D2/D9): un médico ve los archivos de
// su(s) especialidad(es), no solo los que subió él. `specialtyId` null (filas
// viejas) se resuelve acá desde la especialidad del médico que subió, sin
// tocar la fila (docs/10-modulo-clinico.md §1).
export const getMyPatientRecords = createServerFn({ method: "POST" })
  .inputValidator(z.object({ doctorId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();
    if (data.doctorId !== doctorId) throw new AuthError("FORBIDDEN", "No autorizado");

    const [specialtyIds, allJunctionRows, allLegacyRows] = await Promise.all([
      getDoctorSpecialtyIds(doctorId),
      db
        .select({ doctorId: doctorSpecialties.doctorId, specialtyId: doctorSpecialties.specialtyId })
        .from(doctorSpecialties),
      db.select({ id: doctors.id, specialtyId: doctors.specialtyId }).from(doctors),
    ]);
    const junctionByDoctor = new Map<string, string[]>();
    for (const row of allJunctionRows) {
      junctionByDoctor.set(row.doctorId, [...(junctionByDoctor.get(row.doctorId) ?? []), row.specialtyId]);
    }
    const legacyByDoctor = new Map(allLegacyRows.map((d) => [d.id, d.specialtyId]));

    const rows = await db
      .select({
        id: medicalRecords.id,
        doctorId: medicalRecords.doctorId,
        patientId: medicalRecords.patientId,
        fileName: medicalRecords.fileName,
        fileType: medicalRecords.fileType,
        fileSize: medicalRecords.fileSize,
        recordVersion: medicalRecords.recordVersion,
        createdAt: medicalRecords.createdAt,
        specialtyId: medicalRecords.specialtyId,
        patientFirstName: user.firstName,
        patientLastName: user.lastName,
        patientEmail: user.email,
        patientDni: patients.documentNumber,
      })
      .from(medicalRecords)
      .innerJoin(user, eq(user.id, medicalRecords.patientId))
      .leftJoin(patients, eq(patients.userId, medicalRecords.patientId))
      .orderBy(desc(medicalRecords.createdAt));

    return rows
      .filter((r) => {
        if (r.specialtyId) return specialtyIds.includes(r.specialtyId);
        const junction = junctionByDoctor.get(r.doctorId);
        const resolved = junction && junction.length > 0 ? junction : [legacyByDoctor.get(r.doctorId)];
        return resolved.some((id) => id != null && specialtyIds.includes(id));
      })
      .map((r) => ({
        id: r.id,
        doctorId: r.doctorId,
        patientId: r.patientId,
        fileName: r.fileName,
        fileType: r.fileType,
        fileSize: r.fileSize,
        recordVersion: r.recordVersion,
        createdAt: r.createdAt,
        patient: {
          firstName: r.patientFirstName,
          lastName: r.patientLastName,
          email: r.patientEmail,
          documentNumber: r.patientDni ?? null,
        },
      }));
  });

export const getRecordFile = createServerFn({ method: "POST" })
  .inputValidator(z.object({ recordId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { session, doctorId } = await requireDoctor();
    const record = await db.query.medicalRecords.findFirst({
      where: eq(medicalRecords.id, data.recordId),
      columns: {
        doctorId: true,
        patientId: true,
        specialtyId: true,
        fileData: true,
        storagePath: true,
        fileName: true,
        fileType: true,
        recordVersion: true,
      },
    });
    if (!record) throw new Error("Ficha médica no encontrada");

    // Lectura permitida al autor o a un colega de la misma especialidad (D2),
    // igual que las notas clínicas. Escritura/borrado siguen restringidos al
    // autor (ver deleteMedicalRecord) — la lectura es lo que se comparte.
    if (record.doctorId !== doctorId) {
      const [specialtyIds, uploaderSpecialtyIds] = await Promise.all([
        getDoctorSpecialtyIds(doctorId),
        record.specialtyId ? Promise.resolve([]) : resolveDoctorSpecialtyIds(record.doctorId),
      ]);
      const resolvedIds = record.specialtyId ? [record.specialtyId] : uploaderSpecialtyIds;
      if (!resolvedIds.some((id) => specialtyIds.includes(id))) {
        throw new AuthError("FORBIDDEN", "No autorizado");
      }
      await logClinicalAccess({
        actorUserId: session.user.id,
        patientId: record.patientId,
        recordId: data.recordId,
        action: "ver",
      });
    }
    const fileData = record.storagePath
      ? (await fileStorage.readStoredFile(record.storagePath)).toString("base64")
      : record.fileData;
    if (!fileData) throw new Error("Ficha médica sin archivo asociado");
    return {
      fileData,
      fileName: record.fileName,
      fileType: record.fileType,
      recordVersion: record.recordVersion,
    };
  });

export const deleteMedicalRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ recordId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();
    const record = await db.query.medicalRecords.findFirst({
      where: eq(medicalRecords.id, data.recordId),
      columns: { doctorId: true, storagePath: true },
    });
    if (!record) throw new Error("Ficha médica no encontrada");
    if (record.doctorId !== doctorId) throw new AuthError("FORBIDDEN", "No autorizado");
    await db.delete(medicalRecords).where(eq(medicalRecords.id, data.recordId));
    if (record.storagePath) await fileStorage.deleteStoredFile(record.storagePath);
    return { success: true };
  });

// Plan 10, Fase 4, D9: los archivos siguen la misma regla de visibilidad que
// las notas. El paciente ve los suyos con patientVisible=true.
export const getMyVisibleRecords = createServerFn({ method: "POST" }).handler(async () => {
  const session = await requireSession();
  const rows = await db.query.medicalRecords.findMany({
    where: and(eq(medicalRecords.patientId, session.user.id), eq(medicalRecords.patientVisible, true)),
    with: { doctor: { with: { user: true, specialty: true } } },
    orderBy: [desc(medicalRecords.createdAt)],
  });
  return rows;
});

export const getMyRecordFile = createServerFn({ method: "POST" })
  .inputValidator(z.object({ recordId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const record = await db.query.medicalRecords.findFirst({
      where: eq(medicalRecords.id, data.recordId),
      columns: {
        patientId: true,
        patientVisible: true,
        fileData: true,
        storagePath: true,
        fileName: true,
        fileType: true,
      },
    });
    if (!record) throw new Error("Ficha médica no encontrada");
    if (record.patientId !== session.user.id || !record.patientVisible) {
      throw new AuthError("FORBIDDEN", "No autorizado");
    }
    const fileData = record.storagePath
      ? (await fileStorage.readStoredFile(record.storagePath)).toString("base64")
      : record.fileData;
    if (!fileData) throw new Error("Ficha médica sin archivo asociado");
    return { fileData, fileName: record.fileName, fileType: record.fileType };
  });
