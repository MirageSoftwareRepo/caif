// Predicado puro de permisos del módulo clínico (Plan 10, Fase 2). Sin acceso a DB
// para poder testearlo exhaustivamente. El chequeo real siempre se aplica en el
// servidor dentro de las server fns (docs/10-modulo-clinico.md §2) — el cliente
// puede ocultar botones, pero eso no es control de acceso.

export type ClinicalActor =
  | { kind: "doctor"; doctorId: string; specialtyIds: string[] }
  | { kind: "patient"; userId: string }
  | { kind: "staff" }
  | { kind: "admin" };

export type NoteRef = {
  patientId: string;
  doctorId: string;
  specialtyId: string;
  status: "borrador" | "firmada";
  patientVisibility: "visible" | "en_consulta";
  releasedToPatientAt: Date | null;
};

export type Grant = {
  targetDoctorId: string;
  patientId: string;
  specialtyId: string;
  status: "pendiente" | "aprobado" | "rechazado" | "revocado" | "vencido";
  expiresAt: Date | null;
};

function hasValidGrant(actorDoctorId: string, note: NoteRef, grants: Grant[], now: Date): boolean {
  return grants.some(
    (g) =>
      g.targetDoctorId === actorDoctorId &&
      g.patientId === note.patientId &&
      g.specialtyId === note.specialtyId &&
      g.status === "aprobado" &&
      (g.expiresAt === null || g.expiresAt.getTime() > now.getTime()),
  );
}

/**
 * docs/10-modulo-clinico.md §2, tabla "Puede leer".
 * Admin siempre devuelve false acá: su lectura nunca es pasiva, pasa por la vía
 * explícita de §4ter (motivo obligatorio + auditoría), no por este predicado.
 */
export function canReadNote(
  actor: ClinicalActor,
  note: NoteRef,
  grants: Grant[],
  now: Date,
): boolean {
  switch (actor.kind) {
    case "doctor":
      if (note.doctorId === actor.doctorId) return true;
      if (actor.specialtyIds.includes(note.specialtyId)) return true;
      return hasValidGrant(actor.doctorId, note, grants, now);
    case "patient":
      return (
        note.patientId === actor.userId &&
        note.status === "firmada" &&
        (note.patientVisibility === "visible" || note.releasedToPatientAt !== null)
      );
    case "staff":
    case "admin":
      return false;
  }
}

/** docs/10-modulo-clinico.md §2, tabla "Puede escribir": solo el autor, solo en borrador. */
export function canWriteNote(actor: ClinicalActor, note: NoteRef): boolean {
  return actor.kind === "doctor" && actor.doctorId === note.doctorId && note.status === "borrador";
}

/**
 * docs/10-modulo-clinico.md §2, tabla "Puede firmar": solo el autor, solo notas propias.
 * Se exige además `status === "borrador"`: una nota firmada es inmutable por
 * cualquier vía (criterio de aceptación "Inmutabilidad"), firmar de nuevo sería
 * una forma de alterarla.
 */
export function canSignNote(actor: ClinicalActor, note: NoteRef): boolean {
  return actor.kind === "doctor" && actor.doctorId === note.doctorId && note.status === "borrador";
}
