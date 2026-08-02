import { describe, it, expect } from "vitest";
import { isWithinDoctorSchedule } from "./appointment-state";

// doctorSchedules.weekday usa lunes = 0 (ver DAYS en src/components/doctor/shared.ts
// y el calculo (getDay() + 6) % 7 de src/lib/slots.ts).
describe("isWithinDoctorSchedule — convencion de weekday", () => {
  // 2026-08-03 es lunes. getDay() === 1, weekday esperado === 0.
  const LUNES_9AM = new Date(2026, 7, 3, 9, 0, 0, 0);
  // 2026-08-02 es domingo. getDay() === 0, weekday esperado === 6.
  const DOMINGO_9AM = new Date(2026, 7, 2, 9, 0, 0, 0);

  it("acepta un turno el lunes cuando el horario es del lunes (weekday 0)", () => {
    expect(
      isWithinDoctorSchedule(LUNES_9AM, 30, [{ weekday: 0, startTime: "08:00", endTime: "17:00" }]),
    ).toBe(true);
  });

  it("rechaza un turno el domingo cuando el horario es del lunes (weekday 0)", () => {
    expect(
      isWithinDoctorSchedule(DOMINGO_9AM, 30, [
        { weekday: 0, startTime: "08:00", endTime: "17:00" },
      ]),
    ).toBe(false);
  });

  it("acepta un turno el domingo cuando el horario es del domingo (weekday 6)", () => {
    expect(
      isWithinDoctorSchedule(DOMINGO_9AM, 30, [
        { weekday: 6, startTime: "08:00", endTime: "17:00" },
      ]),
    ).toBe(true);
  });

  it("rechaza un turno que se pasa del fin del bloque", () => {
    expect(
      isWithinDoctorSchedule(LUNES_9AM, 30, [{ weekday: 0, startTime: "08:00", endTime: "09:15" }]),
    ).toBe(false);
  });
});
