import { describe, it, expect } from "vitest";
import { blocksToOccupied, validateTimeBlock } from "@/lib/time-blocks";
import { generateSlots } from "@/lib/slots";
import type { ScheduleBlock, OccupiedRange } from "@/lib/slots";

// 2026-08-03 es lunes -> weekday 0 con la convencion lunes = 0.
const LUNES = (h: number, m = 0) => new Date(2026, 7, 3, h, m, 0, 0);
const SCHEDULE: ScheduleBlock[] = [{ weekday: 0, startTime: "08:00", endTime: "17:00" }];

describe("blocksToOccupied", () => {
  it("convierte bloques en rangos ocupados", () => {
    const out = blocksToOccupied([{ startAt: LUNES(9), endAt: LUNES(10) }]);
    expect(out).toHaveLength(1);
    expect(out[0].start.getTime()).toBe(LUNES(9).getTime());
    expect(out[0].end.getTime()).toBe(LUNES(10).getTime());
  });

  it("devuelve un array vacio cuando no hay bloques", () => {
    expect(blocksToOccupied([])).toEqual([]);
  });
});

describe("validateTimeBlock", () => {
  const base = {
    schedule: SCHEDULE,
    appointments: [] as OccupiedRange[],
    blocks: [] as OccupiedRange[],
  };

  it("acepta un bloque valido dentro del horario", () => {
    expect(validateTimeBlock({ ...base, start: LUNES(9), end: LUNES(10) })).toBeNull();
  });

  it("rechaza si el fin es anterior al inicio", () => {
    expect(validateTimeBlock({ ...base, start: LUNES(10), end: LUNES(9) })).toBe("INVALID_RANGE");
  });

  it("rechaza si el inicio y el fin son iguales", () => {
    expect(validateTimeBlock({ ...base, start: LUNES(9), end: LUNES(9) })).toBe("INVALID_RANGE");
  });

  it("rechaza un bloque fuera del horario del medico", () => {
    expect(validateTimeBlock({ ...base, start: LUNES(19), end: LUNES(20) })).toBe(
      "OUTSIDE_SCHEDULE",
    );
  });

  it("rechaza un bloque que se pasa del fin del horario", () => {
    expect(validateTimeBlock({ ...base, start: LUNES(16, 30), end: LUNES(17, 30) })).toBe(
      "OUTSIDE_SCHEDULE",
    );
  });

  it("rechaza si se superpone con un turno existente", () => {
    const appointments = [{ start: LUNES(9, 30), end: LUNES(10) }];
    expect(validateTimeBlock({ ...base, appointments, start: LUNES(9), end: LUNES(10) })).toBe(
      "OVERLAPS_APPOINTMENT",
    );
  });

  it("acepta si el turno existente termina justo cuando arranca el bloque", () => {
    const appointments = [{ start: LUNES(8), end: LUNES(9) }];
    expect(
      validateTimeBlock({ ...base, appointments, start: LUNES(9), end: LUNES(10) }),
    ).toBeNull();
  });

  it("rechaza si se superpone con otro bloque", () => {
    const blocks = [{ start: LUNES(9, 30), end: LUNES(11) }];
    expect(validateTimeBlock({ ...base, blocks, start: LUNES(9), end: LUNES(10) })).toBe(
      "OVERLAPS_BLOCK",
    );
  });

  it("prioriza el error de turno sobre el de bloque", () => {
    const appointments = [{ start: LUNES(9), end: LUNES(10) }];
    const blocks = [{ start: LUNES(9), end: LUNES(10) }];
    expect(
      validateTimeBlock({ ...base, appointments, blocks, start: LUNES(9), end: LUNES(10) }),
    ).toBe("OVERLAPS_APPOINTMENT");
  });

  it("rechaza un bloque en un dia sin horario cargado", () => {
    // 2026-08-04 es martes -> weekday 1, que no esta en SCHEDULE.
    const martes = new Date(2026, 7, 4, 9, 0, 0, 0);
    const martesFin = new Date(2026, 7, 4, 10, 0, 0, 0);
    expect(validateTimeBlock({ ...base, start: martes, end: martesFin })).toBe("OUTSIDE_SCHEDULE");
  });
});

// Integracion con generateSlots: es el punto donde el bloqueo se vuelve visible
// para pacientes y recepcion. Si esto se rompe, se puede sobreagendar sobre un bloqueo.
describe("blocksToOccupied dentro de generateSlots", () => {
  const params = {
    date: LUNES(0),
    schedule: SCHEDULE,
    slotMinutes: 30,
    now: new Date(2026, 6, 1), // muy anterior, para que no filtre por hora pasada
  };

  it("marca como no disponible el slot cubierto por un bloque", () => {
    const slots = generateSlots({
      ...params,
      occupied: blocksToOccupied([{ startAt: LUNES(9), endAt: LUNES(10) }]),
    });
    const nueve = slots.find((s) => new Date(s.value).getHours() === 9);
    const once = slots.find((s) => new Date(s.value).getHours() === 11);
    expect(nueve?.available).toBe(false);
    expect(once?.available).toBe(true);
  });

  it("bloquea los dos slots de 30 min que cubre un bloque de una hora", () => {
    const slots = generateSlots({
      ...params,
      occupied: blocksToOccupied([{ startAt: LUNES(9), endAt: LUNES(10) }]),
    });
    const bloqueados = slots.filter((s) => !s.available);
    expect(bloqueados).toHaveLength(2);
  });

  it("no bloquea el slot que arranca justo cuando termina el bloque", () => {
    const slots = generateSlots({
      ...params,
      occupied: blocksToOccupied([{ startAt: LUNES(9), endAt: LUNES(9, 30) }]),
    });
    const nueveTreinta = slots.find(
      (s) => new Date(s.value).getHours() === 9 && new Date(s.value).getMinutes() === 30,
    );
    expect(nueveTreinta?.available).toBe(true);
  });

  it("combina bloques con turnos existentes en el mismo array de occupied", () => {
    const turno = { start: LUNES(11), end: LUNES(11, 30) };
    const slots = generateSlots({
      ...params,
      occupied: [...blocksToOccupied([{ startAt: LUNES(9), endAt: LUNES(9, 30) }]), turno],
    });
    const bloqueados = slots.filter((s) => !s.available);
    expect(bloqueados).toHaveLength(2);
  });
});
