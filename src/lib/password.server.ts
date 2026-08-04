import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function getDefaultDoctorPassword(): string {
  return process.env.DEFAULT_DOCTOR_PASSWORD || "MediCare2026!";
}

export function getAdminDefaultPassword(): string {
  return process.env.DEFAULT_ADMIN_PASSWORD || "AdminMediCare2026!";
}
