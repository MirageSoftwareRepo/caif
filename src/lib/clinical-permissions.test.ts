import { describe, it, expect } from "vitest";
import {
  canReadNote,
  canWriteNote,
  canSignNote,
  type NoteRef,
  type Grant,
} from "./clinical-permissions";

const NOW = new Date("2026-06-01T12:00:00Z");

const PATIENT_ID = "patient-1";
const OTHER_PATIENT_ID = "patient-2";
const DOCTOR_ID = "doctor-1";
const OTHER_DOCTOR_ID = "doctor-2";
const SPECIALTY_ID = "specialty-cardio";
const OTHER_SPECIALTY_ID = "specialty-psico";

function makeNote(overrides: Partial<NoteRef> = {}): NoteRef {
  return {
    patientId: PATIENT_ID,
    doctorId: DOCTOR_ID,
    specialtyId: SPECIALTY_ID,
    status: "firmada",
    patientVisibility: "visible",
    releasedToPatientAt: null,
    ...overrides,
  };
}

function makeGrant(overrides: Partial<Grant> = {}): Grant {
  return {
    targetDoctorId: OTHER_DOCTOR_ID,
    patientId: PATIENT_ID,
    specialtyId: SPECIALTY_ID,
    status: "aprobado",
    expiresAt: new Date("2026-06-30T00:00:00Z"),
    ...overrides,
  };
}

describe("canReadNote — doctor", () => {
  it("el autor lee su propia nota sin importar la especialidad", () => {
    const actor = { kind: "doctor" as const, doctorId: DOCTOR_ID, specialtyIds: [] };
    expect(canReadNote(actor, makeNote(), [], NOW)).toBe(true);
  });

  it("un doctor de la misma especialidad lee, aunque no sea el autor", () => {
    const actor = {
      kind: "doctor" as const,
      doctorId: OTHER_DOCTOR_ID,
      specialtyIds: [SPECIALTY_ID],
    };
    expect(canReadNote(actor, makeNote(), [], NOW)).toBe(true);
  });

  it("un doctor de otra especialidad sin grant no lee", () => {
    const actor = {
      kind: "doctor" as const,
      doctorId: OTHER_DOCTOR_ID,
      specialtyIds: [OTHER_SPECIALTY_ID],
    };
    expect(canReadNote(actor, makeNote(), [], NOW)).toBe(false);
  });

  it("un doctor de otra especialidad con grant aprobado y vigente lee", () => {
    const actor = {
      kind: "doctor" as const,
      doctorId: OTHER_DOCTOR_ID,
      specialtyIds: [OTHER_SPECIALTY_ID],
    };
    expect(canReadNote(actor, makeNote(), [makeGrant()], NOW)).toBe(true);
  });

  it("un grant vencido (expiresAt en el pasado) no habilita lectura", () => {
    const actor = {
      kind: "doctor" as const,
      doctorId: OTHER_DOCTOR_ID,
      specialtyIds: [OTHER_SPECIALTY_ID],
    };
    const grant = makeGrant({ expiresAt: new Date("2026-05-01T00:00:00Z") });
    expect(canReadNote(actor, makeNote(), [grant], NOW)).toBe(false);
  });

  it("un grant sin expiresAt (null) no expira", () => {
    const actor = {
      kind: "doctor" as const,
      doctorId: OTHER_DOCTOR_ID,
      specialtyIds: [OTHER_SPECIALTY_ID],
    };
    const grant = makeGrant({ expiresAt: null });
    expect(canReadNote(actor, makeNote(), [grant], NOW)).toBe(true);
  });

  it.each(["pendiente", "rechazado", "revocado", "vencido"] as const)(
    "un grant en estado %s no habilita lectura",
    (status) => {
      const actor = {
        kind: "doctor" as const,
        doctorId: OTHER_DOCTOR_ID,
        specialtyIds: [OTHER_SPECIALTY_ID],
      };
      const grant = makeGrant({ status });
      expect(canReadNote(actor, makeNote(), [grant], NOW)).toBe(false);
    },
  );

  it("un grant dirigido a otro doctor no habilita lectura", () => {
    const actor = {
      kind: "doctor" as const,
      doctorId: "doctor-3",
      specialtyIds: [OTHER_SPECIALTY_ID],
    };
    expect(canReadNote(actor, makeNote(), [makeGrant()], NOW)).toBe(false);
  });

  it("un grant sobre otro paciente no habilita lectura", () => {
    const actor = {
      kind: "doctor" as const,
      doctorId: OTHER_DOCTOR_ID,
      specialtyIds: [OTHER_SPECIALTY_ID],
    };
    const grant = makeGrant({ patientId: OTHER_PATIENT_ID });
    expect(canReadNote(actor, makeNote(), [grant], NOW)).toBe(false);
  });

  it("un grant sobre otra especialidad no habilita lectura", () => {
    const actor = {
      kind: "doctor" as const,
      doctorId: OTHER_DOCTOR_ID,
      specialtyIds: [],
    };
    const grant = makeGrant({ specialtyId: "specialty-derma" });
    expect(canReadNote(actor, makeNote(), [grant], NOW)).toBe(false);
  });
});

describe("canReadNote — paciente", () => {
  it("el paciente lee su propia nota firmada y visible", () => {
    const actor = { kind: "patient" as const, userId: PATIENT_ID };
    expect(canReadNote(actor, makeNote(), [], NOW)).toBe(true);
  });

  it("el paciente no lee una nota en borrador, aunque sea suya", () => {
    const actor = { kind: "patient" as const, userId: PATIENT_ID };
    expect(canReadNote(actor, makeNote({ status: "borrador" }), [], NOW)).toBe(false);
  });

  it("el paciente no lee una nota firmada como en_consulta sin liberar", () => {
    const actor = { kind: "patient" as const, userId: PATIENT_ID };
    const note = makeNote({ patientVisibility: "en_consulta", releasedToPatientAt: null });
    expect(canReadNote(actor, note, [], NOW)).toBe(false);
  });

  it("el paciente lee una nota en_consulta ya liberada", () => {
    const actor = { kind: "patient" as const, userId: PATIENT_ID };
    const note = makeNote({
      patientVisibility: "en_consulta",
      releasedToPatientAt: new Date("2026-05-15T00:00:00Z"),
    });
    expect(canReadNote(actor, note, [], NOW)).toBe(true);
  });

  it("el paciente no lee la nota de otro paciente", () => {
    const actor = { kind: "patient" as const, userId: OTHER_PATIENT_ID };
    expect(canReadNote(actor, makeNote(), [], NOW)).toBe(false);
  });
});

describe("canReadNote — recepción y admin", () => {
  it("recepción nunca lee contenido clínico", () => {
    expect(canReadNote({ kind: "staff" }, makeNote(), [], NOW)).toBe(false);
  });

  it("admin no lee de forma pasiva por este predicado (va por §4ter)", () => {
    expect(canReadNote({ kind: "admin" }, makeNote(), [], NOW)).toBe(false);
  });
});

describe("canWriteNote", () => {
  it("el autor escribe su propia nota en borrador", () => {
    const actor = { kind: "doctor" as const, doctorId: DOCTOR_ID, specialtyIds: [] };
    expect(canWriteNote(actor, makeNote({ status: "borrador" }))).toBe(true);
  });

  it("el autor no puede escribir una nota ya firmada", () => {
    const actor = { kind: "doctor" as const, doctorId: DOCTOR_ID, specialtyIds: [] };
    expect(canWriteNote(actor, makeNote({ status: "firmada" }))).toBe(false);
  });

  it("un doctor de la misma especialidad no puede escribir la nota de otro autor", () => {
    const actor = {
      kind: "doctor" as const,
      doctorId: OTHER_DOCTOR_ID,
      specialtyIds: [SPECIALTY_ID],
    };
    expect(canWriteNote(actor, makeNote({ status: "borrador" }))).toBe(false);
  });

  it.each([
    { kind: "patient" as const, userId: PATIENT_ID },
    { kind: "staff" as const },
    { kind: "admin" as const },
  ])("actor %o nunca puede escribir", (actor) => {
    expect(canWriteNote(actor, makeNote({ status: "borrador" }))).toBe(false);
  });
});

describe("canSignNote", () => {
  it("el autor firma su propia nota en borrador", () => {
    const actor = { kind: "doctor" as const, doctorId: DOCTOR_ID, specialtyIds: [] };
    expect(canSignNote(actor, makeNote({ status: "borrador" }))).toBe(true);
  });

  it("una nota ya firmada no se puede volver a firmar", () => {
    const actor = { kind: "doctor" as const, doctorId: DOCTOR_ID, specialtyIds: [] };
    expect(canSignNote(actor, makeNote({ status: "firmada" }))).toBe(false);
  });

  it("un doctor que no es el autor no puede firmar, aunque comparta especialidad", () => {
    const actor = {
      kind: "doctor" as const,
      doctorId: OTHER_DOCTOR_ID,
      specialtyIds: [SPECIALTY_ID],
    };
    expect(canSignNote(actor, makeNote({ status: "borrador" }))).toBe(false);
  });

  it.each([
    { kind: "patient" as const, userId: PATIENT_ID },
    { kind: "staff" as const },
    { kind: "admin" as const },
  ])("actor %o nunca puede firmar", (actor) => {
    expect(canSignNote(actor, makeNote({ status: "borrador" }))).toBe(false);
  });
});
