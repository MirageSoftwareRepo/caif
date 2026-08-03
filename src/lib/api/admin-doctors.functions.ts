import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db";
import { doctors, doctorSpecialties, clinicalNotes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole } from "./_guards";
import { getDoctorSpecialtyIds } from "./db-helpers";

export const getDoctorsBySpecialty = createServerFn({ method: "POST" })
  .inputValidator(z.object({ specialtyId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const ds = await db.query.doctorSpecialties.findMany({
      where: eq(doctorSpecialties.specialtyId, data.specialtyId),
      with: { doctor: { with: { user: true, specialties: { with: { specialty: true } } } } },
    });
    return ds.map((d) => d.doctor);
  });

export const getAllDoctors = createServerFn({ method: "GET" }).handler(async () => {
  await requireRole("recepcionista", "admin");
  return db.query.doctors.findMany({
    with: {
      specialty: true,
      user: true,
      specialties: { with: { specialty: true } },
    },
  });
});

export const updateDoctor = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      specialtyIds: z.array(z.string().uuid()).optional(),
      licenseNumber: z.string().optional(),
      bio: z.string().optional(),
      slotMinutes: z.number().int().min(15).max(120).optional(),
      insuranceCompanies: z.array(z.string()).optional(),
      isActive: z.boolean().optional(),
      // Plan 10, Fase 3, D16. Se setea al desactivar un médico: quien sucede
      // en la potestad de aprobar pedidos de acceso a sus notas (nunca en la
      // autoría, que es un hecho histórico). Null limpia el sucesor.
      successorDoctorId: z.string().uuid().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("admin");
    const { id, specialtyIds, insuranceCompanies, successorDoctorId, ...updateData } = data;

    if (successorDoctorId) {
      if (successorDoctorId === id) {
        throw new Error("Un médico no puede ser su propio sucesor");
      }
      const [outgoingSpecialties, successorSpecialties] = await Promise.all([
        getDoctorSpecialtyIds(id),
        getDoctorSpecialtyIds(successorDoctorId),
      ]);
      const sharesSpecialty = outgoingSpecialties.some((s) => successorSpecialties.includes(s));
      if (!sharesSpecialty) {
        throw new Error("El sucesor debe compartir al menos una especialidad con el médico saliente");
      }
    }

    await db
      .update(doctors)
      .set({
        ...updateData,
        insuranceCompanies: insuranceCompanies || null,
        ...(successorDoctorId !== undefined ? { successorDoctorId } : {}),
      })
      .where(eq(doctors.id, id));
    if (specialtyIds) {
      await db.delete(doctorSpecialties).where(eq(doctorSpecialties.doctorId, id));
      if (specialtyIds.length > 0) {
        await db
          .insert(doctorSpecialties)
          .values(specialtyIds.map((specialtyId) => ({ doctorId: id, specialtyId })));
      }
    }
    return { success: true };
  });

export const deleteDoctor = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireRole("admin");

    // Plan 10, §12 (riesgo Alto): un DELETE sobre doctors cascadearía a
    // clinical_notes por la FK y destruiría historia clínica. Se bloquea acá,
    // antes de llegar a la restricción de la DB, para dar un mensaje claro.
    const hasNotes = await db.query.clinicalNotes.findFirst({
      where: eq(clinicalNotes.doctorId, data.id),
      columns: { id: true },
    });
    if (hasNotes) {
      throw new Error(
        "No se puede borrar: este médico tiene notas clínicas asociadas. Desactivalo en su lugar.",
      );
    }

    await db.delete(doctorSpecialties).where(eq(doctorSpecialties.doctorId, data.id));
    await db.delete(doctors).where(eq(doctors.id, data.id));
    return { success: true };
  });

export const updateDoctorWhatsappPreference = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      doctorId: z.string().uuid(),
      enabled: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await requireRole("admin", "medico");
    await db
      .update(doctors)
      .set({ whatsappNotifications: data.enabled })
      .where(eq(doctors.id, data.doctorId));
    return { success: true };
  });
