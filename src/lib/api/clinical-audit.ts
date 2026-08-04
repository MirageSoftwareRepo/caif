import { getDb } from "@/lib/server-imports";
import { clinicalAccessLog } from "@/db/schema";

// Auditoría append-only del módulo clínico (Plan 10, Fase 3). Nunca se hace
// UPDATE ni DELETE sobre clinical_access_log — ver docs/10-modulo-clinico.md §12.
export type ClinicalAccessAction =
  | "ver"
  | "imprimir"
  | "firmar"
  | "addendum"
  | "solicitar"
  | "aprobar"
  | "rechazar"
  | "revocar"
  | "liberar"
  | "ver_admin"
  | "suceder";

export async function logClinicalAccess(params: {
  actorUserId: string;
  patientId?: string;
  noteId?: string;
  recordId?: string;
  action: ClinicalAccessAction;
  viaRequestId?: string;
  reason?: string;
}) {
  const db = await getDb();
  await db.insert(clinicalAccessLog).values({
    actorUserId: params.actorUserId,
    patientId: params.patientId ?? null,
    noteId: params.noteId ?? null,
    recordId: params.recordId ?? null,
    action: params.action,
    viaRequestId: params.viaRequestId ?? null,
    reason: params.reason ?? null,
  });
}
