// Funciones puras del bloqueo de agenda. Sin acceso a DB ni a red, para poder
// testearlas exhaustivamente (mismo criterio que src/lib/slots.ts, Plan 06).
import type { OccupiedRange, ScheduleBlock } from "@/lib/slots";
import { isWithinDoctorSchedule } from "@/lib/appointment-state";

export type TimeBlockInput = { startAt: Date; endAt: Date };

export type BlockValidationError =
  | "INVALID_RANGE"
  | "OUTSIDE_SCHEDULE"
  | "OVERLAPS_APPOINTMENT"
  | "OVERLAPS_BLOCK";

export const BLOCK_ERROR_MESSAGES: Record<BlockValidationError, string> = {
  INVALID_RANGE: "La hora de fin debe ser posterior a la de inicio",
  OUTSIDE_SCHEDULE: "El horario está fuera de tu agenda configurada",
  OVERLAPS_APPOINTMENT: "Ya hay un turno agendado en ese horario",
  OVERLAPS_BLOCK: "Ya tenés ese horario bloqueado",
};

export function blocksToOccupied(blocks: TimeBlockInput[]): OccupiedRange[] {
  return blocks.map((b) => ({ start: b.startAt, end: b.endAt }));
}

function overlapsAny(start: Date, end: Date, ranges: OccupiedRange[]): boolean {
  return ranges.some((r) => start < r.end && end > r.start);
}

export function validateTimeBlock(params: {
  start: Date;
  end: Date;
  schedule: ScheduleBlock[];
  appointments: OccupiedRange[];
  blocks: OccupiedRange[];
}): BlockValidationError | null {
  const { start, end, schedule, appointments, blocks } = params;

  if (end <= start) return "INVALID_RANGE";

  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
  if (!isWithinDoctorSchedule(start, durationMinutes, schedule)) return "OUTSIDE_SCHEDULE";

  if (overlapsAny(start, end, appointments)) return "OVERLAPS_APPOINTMENT";
  if (overlapsAny(start, end, blocks)) return "OVERLAPS_BLOCK";

  return null;
}

// Etiqueta visible de un bloqueo en la grilla. El medico puede escribir ahi el
// nombre de alguien que ocupa el horario pero todavia no tiene cuenta; si no
// escribio nada, el bloqueo se sigue mostrando como "Bloqueado".
export const BLOCK_FALLBACK_LABEL = "Bloqueado";

export function blockLabel(reason: string | null | undefined): string {
  return reason?.trim() || BLOCK_FALLBACK_LABEL;
}
