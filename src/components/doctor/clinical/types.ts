export type ClinicalNote = {
  id: string;
  patientId: string;
  doctorId: string;
  specialtyId: string;
  appointmentId: string | null;
  sessionDate: string | Date;
  status: "borrador" | "firmada";
  motivo: string | null;
  diagnostico: string | null;
  proximoControl: string | Date | null;
  bodyHtml: string | null;
  bodyText: string | null;
  signedAt: string | Date | null;
  signedByUserId: string | null;
  patientVisibility: "visible" | "en_consulta";
  releasedToPatientAt: string | Date | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
  doctor?: { user: { firstName: string; lastName: string } };
  specialty?: { name: string };
  addenda: ClinicalNoteAddendum[];
};

export type ClinicalNoteAddendum = {
  id: string;
  bodyHtml: string;
  createdAt: string | Date | null;
  author: { user: { firstName: string; lastName: string } };
};

export type ClinicalPatient = {
  id: string;
  firstName: string;
  lastName: string;
  documentNumber: string | null;
};

export const TEMPLATES = [
  "Paciente refiere ",
  "Al examen físico se observa ",
  "Se indica ",
  "Control en ",
  "Se deriva a ",
] as const;
