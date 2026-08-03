import { db } from "@/db";
import { user, patients, doctors, doctorSchedules, doctorSpecialties } from "@/db/schema";
import { eq, like, or, and } from "drizzle-orm";

export async function getUserById(id: string) {
  return db.query.user.findFirst({ where: eq(user.id, id) });
}

export async function getUserByEmail(email: string) {
  return db.query.user.findFirst({ where: eq(user.email, email.toLowerCase()) });
}

export async function getPatientByUserId(userId: string) {
  return db.query.patients.findFirst({ where: eq(patients.userId, userId) });
}

export async function getDoctorByUserId(userId: string) {
  return db.query.doctors.findFirst({
    where: eq(doctors.userId, userId),
    with: { specialty: true, specialties: { with: { specialty: true } } },
  });
}

export async function getAllUsers(options?: {
  search?: string;
  role?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];

  if (options?.search) {
    const term = `%${options.search}%`;
    conditions.push(
      or(like(user.firstName, term), like(user.lastName, term), like(user.email, term)),
    );
  }

  if (options?.role) {
    conditions.push(
      eq(user.role, options.role as "paciente" | "medico" | "recepcionista" | "admin"),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db.query.user.findMany({
    where,
    limit: options?.limit || 50,
    offset: options?.offset || 0,
    orderBy: (user, { asc }) => [asc(user.lastName), asc(user.firstName)],
  });
}

export async function getDoctorSchedules(doctorId: string) {
  return db.query.doctorSchedules.findMany({
    where: eq(doctorSchedules.doctorId, doctorId),
  });
}

// Especialidades del doctor vía la tabla-junction (varias por doctor). Usado
// por el módulo clínico para el aislamiento por especialidad (Plan 10, D2).
export async function getDoctorSpecialtyIds(doctorId: string): Promise<string[]> {
  const rows = await db
    .select({ specialtyId: doctorSpecialties.specialtyId })
    .from(doctorSpecialties)
    .where(eq(doctorSpecialties.doctorId, doctorId));
  return rows.map((r) => r.specialtyId);
}
