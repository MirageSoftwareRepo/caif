export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: "La contraseña debe tener al menos 8 caracteres" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "La contraseña debe tener al menos una mayúscula" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "La contraseña debe tener al menos una minúscula" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "La contraseña debe tener al menos un número" };
  }
  return { valid: true };
}
