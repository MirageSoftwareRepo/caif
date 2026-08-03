# Módulo clínico — Fases 0 y 1: refactor de `doctor.tsx` + bloqueo de agenda

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/10-modulo-clinico.md`](../../10-modulo-clinico.md) — Fases 0 y 1 (pasos 1–9).

**Goal:** Desarmar `src/routes/doctor.tsx` (1474 líneas) en componentes por tab sin cambiar comportamiento, y agregar la capacidad de que un médico bloquee horarios propios para pacientes extraparticulares, con alta rápida opcional que promueve el bloqueo a turno real.

**Architecture:** El bloqueo vive en una tabla nueva `doctor_time_blocks`. La lógica de disponibilidad no cambia: [`generateSlots`](../../../src/lib/slots.ts) ya recibe `occupied: OccupiedRange[]`, así que los bloques se convierten a rangos y se concatenan en los tres llamadores. La validación de un bloque se extrae a una función pura testeable en `src/lib/time-blocks.ts`, siguiendo el patrón que el Plan 06 estableció con `slots.ts`. El alta rápida crea `user` + `patients` + `appointment` y borra el bloque, todo en una transacción.

**Tech Stack:** TanStack Start (React 19, SSR), TypeScript, Drizzle ORM sobre PostgreSQL 16, better-auth, Radix UI + Tailwind v4, vitest (jsdom), Bun.

## Global Constraints

Copiadas del spec y de [`docs/README.md`](../../README.md). **Aplican a todas las tareas.**

- **Package manager: Bun.** Nunca `npm`, `pnpm` ni `yarn`, aunque exista `package-lock.json`.
- **Schema 100 % aditivo.** `bunx drizzle-kit push` corre en cada deploy y auto-aplica `schema.ts` contra producción. Solo tablas nuevas y columnas nullable. Nada que modifique o borre filas existentes.
- **Ventana de deploy: 21:00–08:00 ARG.** Fuera de esa franja el sistema atiende pacientes.
- **No endurecer el login de pacientes.** El alta rápida es un alta administrativa, no un flujo de registro. Sin verificación de email, sin 2FA.
- **Server functions:** `createServerFn` de `@tanstack/react-start` con `.inputValidator()` (NO `.validator()`). Las GET no pueden usar `.inputValidator()` — usar POST siempre.
- **Todo archivo de server fn vive en `src/lib/api/` como `*.functions.ts`.** Nunca importar `db-helpers.ts` ni `@/db` desde un archivo de ruta: filtra `postgres` al bundle del cliente.
- **Guards:** usar `requireSession` / `requireRole` / `requireDoctor` de [`src/lib/api/_guards.ts`](../../../src/lib/api/_guards.ts). Lanzan `AuthError` con code `UNAUTHENTICATED` | `FORBIDDEN`.
- **Zona horaria:** todo el sistema asume ARG fijo (`America/Argentina/Buenos_Aires`). Las fechas se computan en hora local del proceso.
- **`doctorSchedules.weekday` usa lunes = 0.** Ver Task 4.
- **Convenciones móviles** (de [`CLAUDE.md`](../../../CLAUDE.md)): botones de acción con solo ícono llevan `min-h-[44px] min-w-[44px]`; tabs con muchos ítems van envueltas en `<div className="overflow-x-auto [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0">` con `<span className="hidden sm:inline">` en las etiquetas.
- **Path alias:** `@/*` → `src/*`.
- **Antes de cada commit:** `bun lint` y `bunx tsc --noEmit`. Los errores de `prettier/prettier` por CRLF son el caso más común — se arreglan con `bun format`.
- **`bunfig.toml` tiene `minimumReleaseAge = 86400`.** Una dependencia publicada hace menos de 24 h no instala.

---

## ⚠️ Hallazgo previo: bug de weekday

Durante la planificación apareció una inconsistencia **que no está en el spec** y que hay que resolver antes de la Task 5.

`doctorSchedules.weekday` se guarda con **lunes = 0**:

- El editor de horarios usa `DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]` y el índice del array es el `weekday` ([`doctor.tsx:629-633`](../../../src/routes/doctor.tsx)).
- [`slots.ts:24`](../../../src/lib/slots.ts) lo lee como `(date.getDay() + 6) % 7`, que es lunes = 0. Sus tests lo confirman.

Pero [`appointment-state.ts:55`](../../../src/lib/appointment-state.ts) lo lee como `scheduledAt.getDay()`, que es **domingo = 0**:

```ts
export function isWithinDoctorSchedule(
  scheduledAt: Date,
  durationMinutes: number,
  schedules: DoctorScheduleBlock[],
): boolean {
  const weekday = scheduledAt.getDay();   // ← domingo = 0
  ...
}
```

**Consecuencia:** `bookAppointment` valida cada turno contra el horario del día siguiente. Un médico que atiende solo lunes tiene bloqueado el lunes y habilitado el domingo.

**Decisión requerida antes de ejecutar la Task 5.** Es un bugfix de una línea con un test, pero cambia comportamiento en producción y está fuera del alcance del spec. La Task 4 lo arregla; si preferís tratarlo aparte, salteala y hacé que `validateTimeBlock` no dependa de `isWithinDoctorSchedule`.

---

## File Structure

### Se crean

| Archivo                                        | Responsabilidad                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/time-blocks.ts`                       | Funciones puras: conversión de bloques a rangos y validación. Sin acceso a DB                                               |
| `src/test/time-blocks.test.ts`                 | Tests de lo anterior                                                                                                        |
| `src/lib/api/time-blocks.functions.ts`         | Server fns: crear, listar, borrar bloque; alta rápida con promoción a turno                                                 |
| `src/components/doctor/AgendaTab.tsx`          | Agenda día/semana del médico                                                                                                |
| `src/components/doctor/HorariosTab.tsx`        | Editor de horarios semanales                                                                                                |
| `src/components/doctor/ObrasSocialesTab.tsx`   | Obras sociales aceptadas                                                                                                    |
| `src/components/doctor/ArchivosTab.tsx`        | Archivos del paciente (era `MedicalRecordsTab`)                                                                             |
| `src/components/doctor/DescripcionTab.tsx`     | Bio pública del médico                                                                                                      |
| `src/components/doctor/PerfilTab.tsx`          | Perfil + preferencias de WhatsApp                                                                                           |
| `src/components/doctor/shared.ts`              | Helpers de fecha compartidos entre tabs (`startOfDay`, `addDays`, `startOfWeek`, `fmtDate`, `fmtTime`, `DAYS`, `DAYS_FULL`) |
| `src/components/doctor/BlockSlotDialog.tsx`    | Diálogo de bloqueo de horario                                                                                               |
| `src/components/doctor/QuickPatientDialog.tsx` | Alta rápida de paciente sobre un bloque                                                                                     |

### Se modifican

| Archivo                                 | Cambio                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/routes/doctor.tsx`                 | Queda como shell de ruta: layout, tabs y composición. Objetivo: menos de 200 líneas |
| `src/db/schema.ts`                      | Tabla `doctorTimeBlocks` + relación                                                 |
| `src/lib/appointment-state.ts`          | Corrección del weekday (Task 4)                                                     |
| `src/lib/api/appointments.functions.ts` | `getDayAppointments` devuelve también los bloques                                   |
| `src/routes/dashboard.tsx`              | `occupied` incluye bloques (línea ~257)                                             |
| `src/routes/staff.tsx`                  | `occupied` incluye bloques (línea ~407)                                             |

### No se toca

- La lógica interna de `generateSlots`. Los bloques se suman en los llamadores.
- `medicalRecords` y sus server fns. Solo cambia el nombre del componente y la etiqueta visible.
- El scheduler de WhatsApp, el softlock, el login de pacientes.

---

## Task 1: Extraer helpers compartidos y el tab de Archivos

Primer corte del refactor. Se empieza por el tab más independiente para validar el patrón.

**Files:**

- Create: `src/components/doctor/shared.ts`
- Create: `src/components/doctor/ArchivosTab.tsx`
- Modify: `src/routes/doctor.tsx`

**Interfaces:**

- Consumes: nada.
- Produces:
  - `src/components/doctor/shared.ts` exporta `DAYS: string[]`, `DAYS_FULL: string[]`, `startOfDay(d: Date): Date`, `addDays(d: Date, n: number): Date`, `startOfWeek(d: Date): Date`, `fmtDate(d: Date): string`, `fmtTime(d: Date): string`.
  - `src/components/doctor/ArchivosTab.tsx` exporta `export function ArchivosTab({ userId }: { userId: string })` como named export.

- [ ] **Step 1: Verificar que el árbol está limpio antes de empezar**

```bash
bun install
bunx tsc --noEmit
bun test
```

Esperado: los tres terminan sin error. Si `bun test` ya falla, **pará acá** — hay que resolver eso antes de refactorizar, porque si no no vas a poder distinguir una rotura tuya de una preexistente.

- [ ] **Step 2: Crear `src/components/doctor/shared.ts`**

Copiá textualmente los helpers de `doctor.tsx:91-111`:

```ts
export const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const DAYS_FULL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  return addDays(x, -day);
}

export const fmtDate = (d: Date) =>
  d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

export const fmtTime = (d: Date) =>
  d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
```

`startOfWeek` usa `(x.getDay() + 6) % 7`, que es lunes = 0. Es la misma convención de `slots.ts`. No la cambies.

- [ ] **Step 3: Crear `src/components/doctor/ArchivosTab.tsx`**

Mové el componente `MedicalRecordsTab` de `doctor.tsx` (arranca en la línea 770) y todo lo que use solo él: el tipo `PatientRecord` (~línea 700) y el subcomponente de tarjeta por paciente (~línea 931).

Cambios respecto del original, y solo estos:

1. `function MedicalRecordsTab(...)` pasa a `export function ArchivosTab(...)`.
2. Los imports que estaban arriba de `doctor.tsx` se traen a este archivo. Como mínimo vas a necesitar:

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Upload, Eye, Trash2, Search, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import {
  uploadMedicalRecord,
  getMyPatientRecords,
  getRecordFile,
  deleteMedicalRecord,
} from "@/lib/api/medical-records.functions";
import { getDoctorIdByUserId } from "@/lib/api/doctor-schedule.functions";
```

Ajustá la lista según lo que el componente use realmente — `tsc` te lo va a decir.

**No cambies ninguna otra línea del cuerpo.** Nada de "de paso mejoro esto". Un refactor que además cambia comportamiento es imposible de revisar.

- [ ] **Step 4: Actualizar `doctor.tsx`**

Borrá el código que moviste. Agregá el import:

```tsx
import { ArchivosTab } from "@/components/doctor/ArchivosTab";
import {
  DAYS,
  DAYS_FULL,
  startOfDay,
  addDays,
  startOfWeek,
  fmtDate,
  fmtTime,
} from "@/components/doctor/shared";
```

Reemplazá el uso en la línea ~299:

```tsx
<TabsContent value="fichas">
  <ArchivosTab userId={user.id} />
</TabsContent>
```

Renombrá el tab a "Archivos" (D6 del spec), líneas ~276-279:

```tsx
<TabsTrigger value="fichas" className="gap-1 sm:gap-2">
  <FileText className="h-4 w-4" />
  <span className="hidden sm:inline">Archivos</span>
</TabsTrigger>
```

**Dejá `value="fichas"` como está.** Es la clave interna de la tab; cambiarla rompería cualquier link o estado guardado sin ningún beneficio.

- [ ] **Step 5: Verificar tipos y lint**

```bash
bunx tsc --noEmit
bun lint
```

Esperado: sin errores. Si `bun lint` se queja de `prettier/prettier`, corré `bun format` y volvé a verificar.

- [ ] **Step 6: Smoke test manual**

```bash
bun dev
```

Entrá como médico (`MediCare2026!` es la contraseña por defecto de médicos) y verificá en el tab Archivos:

- La lista de pacientes con archivos carga.
- El buscador filtra.
- "Subir ficha" abre el diálogo y sube un PDF.
- El ojo abre un archivo existente.
- El tacho borra.
- La etiqueta de la tab dice "Archivos".

Si algo no anda, es tuyo: el código era idéntico antes del refactor.

- [ ] **Step 7: Commit**

```bash
git add src/components/doctor/shared.ts src/components/doctor/ArchivosTab.tsx src/routes/doctor.tsx
git commit -m "refactor(doctor): extraer ArchivosTab y helpers compartidos"
```

---

## Task 2: Extraer los tabs de configuración

Horarios, obras sociales, descripción y perfil. Van juntos porque son cuatro extracciones mecánicas idénticas y un revisor no puede aprobar una y rechazar otra.

**Files:**

- Create: `src/components/doctor/HorariosTab.tsx`
- Create: `src/components/doctor/ObrasSocialesTab.tsx`
- Create: `src/components/doctor/DescripcionTab.tsx`
- Create: `src/components/doctor/PerfilTab.tsx`
- Modify: `src/routes/doctor.tsx`

**Interfaces:**

- Consumes: `src/components/doctor/shared.ts` de la Task 1 (`DAYS`, `DAYS_FULL`).
- Produces: cuatro named exports. Las props son las mismas que tenían los componentes internos; leelas del JSX de `doctor.tsx` antes de mover, no las inventes.

- [ ] **Step 1: Extraer `HorariosTab`**

Es el componente del editor semanal (usa `getMySchedule` / `updateMySchedule`, el `byDay` de la línea 629 y `addSlot` de la 607). Mové el componente completo y sus subcomponentes exclusivos. Importá `DAYS` y `DAYS_FULL` desde `@/components/doctor/shared` en vez de redeclararlos.

- [ ] **Step 2: Extraer `ObrasSocialesTab`**

Usa `updateMyInsurance` y `getMyDoctorProfile`.

- [ ] **Step 3: Extraer `DescripcionTab`**

Usa `updateMyBio`.

- [ ] **Step 4: Extraer `PerfilTab`**

Incluye `ProfileEditor`, `DoctorWhatsAppToggle` (línea 113) y el toggle de `updateMyDirectBooking`. `DoctorWhatsAppToggle` se mueve dentro de `PerfilTab.tsx` — es su único consumidor.

- [ ] **Step 5: Actualizar `doctor.tsx`**

Borrá los cuatro componentes movidos, agregá los imports y reemplazá los `<TabsContent>`. Después de esto `doctor.tsx` debería tener solo: la definición de ruta, `DoctorPanel`, el `<Tabs>` y el `AgendaTab` que todavía no se movió.

- [ ] **Step 6: Verificar**

```bash
bunx tsc --noEmit
bun lint
bun test
```

Esperado: los tres limpios.

- [ ] **Step 7: Smoke test manual**

Con `bun dev`, en cada uno de los cuatro tabs: cargá, editá algo, guardá, recargá la página y confirmá que persistió. En Horarios probá específicamente agregar un bloque un lunes y guardarlo — vas a necesitar ese dato en la Task 4.

- [ ] **Step 8: Commit**

```bash
git add src/components/doctor src/routes/doctor.tsx
git commit -m "refactor(doctor): extraer tabs de horarios, obras sociales, descripcion y perfil"
```

---

## Task 3: Extraer el tab de Agenda

El más grande y el que más lógica tiene. Va solo porque es el que más riesgo de rotura carga.

**Files:**

- Create: `src/components/doctor/AgendaTab.tsx`
- Modify: `src/routes/doctor.tsx`

**Interfaces:**

- Consumes: `src/components/doctor/shared.ts`.
- Produces: `export function AgendaTab({ userId }: { userId: string })`.

- [ ] **Step 1: Extraer el componente**

Mové la agenda completa: vista día/semana, navegación de fechas, `DayGrid`, `WeekView`, `FreshnessIndicator`, el diálogo de creación de turno (el que arranca cerca de la línea 1230) y el manejo de estados de turno.

Se lleva estos imports:

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDoctorAppointments,
  updateAppointmentStatus,
  bookAppointment,
  getDayAppointments,
} from "@/lib/api/appointments.functions";
import { getDoctorSchedule } from "@/lib/api/doctor-schedule.functions";
import { searchPatients } from "@/lib/api/admin-users.functions";
import { getAllSpecialties } from "@/lib/api/specialties.functions";
import { generateSlots, type Slot } from "@/lib/slots";
import { DayGrid } from "@/components/agenda/DayGrid";
import { WeekView } from "@/components/agenda/WeekView";
import { FreshnessIndicator } from "@/components/agenda/FreshnessIndicator";
import { useTabVisible } from "@/lib/useTabVisible";
import type { AgendaAppt } from "@/components/agenda/status";
```

**Ojo con el import dinámico de la línea 1245:**

```tsx
const { getDoctorSchedule } = await import("@/lib/api/doctor-schedule.functions");
```

Convertilo a import estático arriba del archivo. El dinámico existía para no inflar el bundle de `doctor.tsx`; ahora que el componente vive aparte, ya no hace falta y el estático es más fácil de seguir.

- [ ] **Step 2: Limpiar `doctor.tsx`**

Debería quedar cerca de esto:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Settings2, Building2, FileText, User } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AgendaTab } from "@/components/doctor/AgendaTab";
import { HorariosTab } from "@/components/doctor/HorariosTab";
import { ObrasSocialesTab } from "@/components/doctor/ObrasSocialesTab";
import { ArchivosTab } from "@/components/doctor/ArchivosTab";
import { DescripcionTab } from "@/components/doctor/DescripcionTab";
import { PerfilTab } from "@/components/doctor/PerfilTab";

export const Route = createFileRoute("/doctor")({
  head: () => ({ meta: [{ title: "Mi Agenda · CAIF" }] }),
  component: DoctorPanel,
});
```

Conservá tal cual el resto de `DoctorPanel`: el guard de rol, el `DashboardLayout` y la estructura de `<Tabs>`.

- [ ] **Step 3: Verificar el tamaño**

```bash
wc -l src/routes/doctor.tsx src/components/doctor/*.tsx
```

Esperado: `doctor.tsx` por debajo de 200 líneas. Si quedó en 400, algo no se movió.

- [ ] **Step 4: Verificar**

```bash
bunx tsc --noEmit
bun lint
bun test
bun build
```

Los cuatro limpios. `bun build` importa acá porque el refactor toca la frontera de imports y podría filtrar código de servidor al bundle del cliente.

- [ ] **Step 5: Smoke test manual completo**

Con `bun dev`, como médico:

- La agenda carga en vista Día y en vista Semana.
- Las flechas de navegación cambian el día y la semana.
- Un turno existente se puede marcar confirmado, ausente y completado.
- "Nuevo turno" abre el diálogo, busca un paciente, lista slots libres y crea el turno.
- El turno recién creado aparece en la grilla sin recargar.
- Los seis tabs abren sin errores en la consola del navegador.

- [ ] **Step 6: Commit**

```bash
git add src/components/doctor src/routes/doctor.tsx
git commit -m "refactor(doctor): extraer AgendaTab; doctor.tsx queda como shell de ruta"
```

**Fin de la Fase 0.** Buen momento para deployar en la ventana nocturna: no hay cambios de schema ni de comportamiento, así que si algo rompió se ve enseguida y el rollback es un `git revert`.

---

## Task 4: Corregir el weekday de `isWithinDoctorSchedule`

Ver "Hallazgo previo". **Confirmá con el responsable del proyecto antes de ejecutar esta tarea.**

**Files:**

- Modify: `src/lib/appointment-state.ts:55`
- Create: `src/lib/appointment-state-weekday.test.ts`

**Interfaces:**

- Consumes: nada.
- Produces: `isWithinDoctorSchedule` mantiene su firma exacta. Solo cambia el comportamiento interno.

- [ ] **Step 1: Escribir el test que falla**

Creá `src/lib/appointment-state-weekday.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
bunx vitest run src/lib/appointment-state-weekday.test.ts
```

Esperado: fallan los tres primeros. El primero da `expected false to be true` porque con `getDay()` busca `weekday === 1` y solo existe el `0`.

- [ ] **Step 3: Corregir la implementación**

En `src/lib/appointment-state.ts`, línea 55:

```ts
const weekday = (scheduledAt.getDay() + 6) % 7;
```

Y agregá el comentario justo arriba de la función:

```ts
// `weekday` en doctorSchedules usa lunes = 0, igual que src/lib/slots.ts.
// Date.getDay() usa domingo = 0, de ahi el desplazamiento.
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
bunx vitest run src/lib/appointment-state-weekday.test.ts
bun test
```

Esperado: los cuatro nuevos en verde y la suite completa sin regresiones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appointment-state.ts src/lib/appointment-state-weekday.test.ts
git commit -m "fix(turnos): isWithinDoctorSchedule usaba domingo=0 y doctorSchedules usa lunes=0"
```

---

## Task 5: Funciones puras de bloqueo

TDD real. Toda la lógica de decisión vive acá, sin DB, para poder testearla a fondo.

**Files:**

- Create: `src/lib/time-blocks.ts`
- Create: `src/test/time-blocks.test.ts`

**Interfaces:**

- Consumes: `OccupiedRange` y `ScheduleBlock` de `@/lib/slots`; `isWithinDoctorSchedule` de `@/lib/appointment-state`.
- Produces:
  - `export type TimeBlockInput = { startAt: Date; endAt: Date }`
  - `export type BlockValidationError = "INVALID_RANGE" | "OUTSIDE_SCHEDULE" | "OVERLAPS_APPOINTMENT" | "OVERLAPS_BLOCK"`
  - `export function blocksToOccupied(blocks: TimeBlockInput[]): OccupiedRange[]`
  - `export function validateTimeBlock(params: { start: Date; end: Date; schedule: ScheduleBlock[]; appointments: OccupiedRange[]; blocks: OccupiedRange[] }): BlockValidationError | null`
  - `export const BLOCK_ERROR_MESSAGES: Record<BlockValidationError, string>`

- [ ] **Step 1: Escribir los tests que fallan**

Creá `src/test/time-blocks.test.ts`:

```ts
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
```

Sumá `generateSlots` al import de `@/lib/slots` al tope del archivo de test.

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
bunx vitest run src/test/time-blocks.test.ts
```

Esperado: FAIL con `Failed to resolve import "@/lib/time-blocks"`.

- [ ] **Step 3: Escribir la implementación mínima**

Creá `src/lib/time-blocks.ts`:

```ts
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
```

`overlapsAny` usa comparación estricta en los bordes: un turno que termina 09:00 y un bloque que arranca 09:00 no se superponen. Es la misma semántica que `overlaps` en `slots.ts:9` — mantenela consistente o los slots y la validación van a discrepar.

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
bunx vitest run src/test/time-blocks.test.ts
```

Esperado: PASS, 16 tests.

Si `OUTSIDE_SCHEDULE` falla en el caso del lunes, la Task 4 no se aplicó. Volvé a esa tarea.

- [ ] **Step 5: Correr la suite completa**

```bash
bun test
bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/time-blocks.ts src/test/time-blocks.test.ts
git commit -m "feat(agenda): funciones puras de validacion de bloqueos con tests"
```

---

## Task 6: Tabla `doctor_time_blocks`

**Files:**

- Modify: `src/db/schema.ts`

**Interfaces:**

- Consumes: `doctors`, `user` de `schema.ts`.
- Produces: `doctorTimeBlocks` con columnas `id: uuid`, `doctorId: uuid`, `startAt: timestamp`, `endAt: timestamp`, `reason: text | null`, `createdByUserId: text | null`, `createdAt: timestamp`.

- [ ] **Step 1: Agregar la tabla**

En `src/db/schema.ts`, después de `doctorSchedules` (línea 134):

```ts
// Plan 10, Fase 1. Bloqueos de agenda que el medico marca para atender pacientes
// extraparticulares no registrados. Tabla nueva y aditiva: no toca datos existentes,
// por lo que es segura bajo el `drizzle-kit push` automatico del deploy.
export const doctorTimeBlocks = pgTable("doctor_time_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id")
    .notNull()
    .references(() => doctors.id, { onDelete: "cascade" }),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  reason: text("reason"),
  createdByUserId: text("created_by_user_id").references(() => user.id),
  createdAt: timestamp("created_at").defaultNow(),
});
```

- [ ] **Step 2: Agregar la relación**

Al final del archivo, junto a las otras `relations`:

```ts
export const doctorTimeBlocksRelations = relations(doctorTimeBlocks, ({ one }) => ({
  doctor: one(doctors, { fields: [doctorTimeBlocks.doctorId], references: [doctors.id] }),
}));
```

Y sumá `timeBlocks: many(doctorTimeBlocks)` dentro de `doctorsRelations` (línea 218).

- [ ] **Step 3: Levantar Postgres y aplicar el schema**

```bash
bun docker:up
bun db:push
```

Esperado: `drizzle-kit` reporta la creación de `doctor_time_blocks` y **ninguna otra operación**. Si menciona un `ALTER` o un `DROP` sobre cualquier otra tabla, **cancelá y revisá** — violaría el congelamiento de datos.

- [ ] **Step 4: Verificar la tabla**

```bash
docker compose exec -T db psql -U postgres -d postgres -c "\d doctor_time_blocks"
```

Esperado: las siete columnas, la PK sobre `id` y la FK de `doctor_id` con `ON DELETE CASCADE`.

- [ ] **Step 5: Verificar tipos**

```bash
bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(db): tabla doctor_time_blocks (aditiva)"
```

---

## Task 7: Server functions de bloqueo

**Files:**

- Create: `src/lib/api/time-blocks.functions.ts`
- Modify: `src/lib/api/appointments.functions.ts` (`getDayAppointments`, línea 248)

**Interfaces:**

- Consumes: `validateTimeBlock`, `blocksToOccupied`, `BLOCK_ERROR_MESSAGES` de `@/lib/time-blocks`; `requireDoctor`, `AuthError` de `./_guards`.
- Produces:
  - `createTimeBlock({ data: { startAt: string; endAt: string; reason?: string } })` → `{ id: string }`
  - `getMyTimeBlocks({ data: { from: string; to: string } })` → `Array<{ id, startAt, endAt, reason }>`
  - `getDoctorTimeBlocks({ data: { doctorId: string; date: string } })` → `Array<{ startAt, endAt }>`
  - `deleteTimeBlock({ data: { blockId: string } })` → `{ success: true }`
  - `getDayAppointments` pasa a devolver `{ appointments: [...], blocks: [...] }`

- [ ] **Step 1: Crear el archivo de server fns**

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db";
import { doctorTimeBlocks, appointments, doctorSchedules } from "@/db/schema";
import { eq, and, gte, lt, ne } from "drizzle-orm";
import { requireDoctor, requireSession, AuthError } from "./_guards";
import { validateTimeBlock, BLOCK_ERROR_MESSAGES } from "@/lib/time-blocks";

function dayBounds(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return {
    dayStart: new Date(year, month - 1, day, 0, 0, 0, 0),
    dayEnd: new Date(year, month - 1, day, 23, 59, 59, 999),
  };
}

export const createTimeBlock = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
      reason: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { session, doctorId } = await requireDoctor();
    const start = new Date(data.startAt);
    const end = new Date(data.endAt);

    const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      23,
      59,
      59,
      999,
    );

    const [schedule, dayAppointments, dayBlocks] = await Promise.all([
      db.query.doctorSchedules.findMany({ where: eq(doctorSchedules.doctorId, doctorId) }),
      db
        .select({
          scheduledAt: appointments.scheduledAt,
          durationMinutes: appointments.durationMinutes,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.doctorId, doctorId),
            gte(appointments.scheduledAt, dayStart),
            lt(appointments.scheduledAt, dayEnd),
            ne(appointments.status, "cancelado"),
          ),
        ),
      db
        .select({ startAt: doctorTimeBlocks.startAt, endAt: doctorTimeBlocks.endAt })
        .from(doctorTimeBlocks)
        .where(
          and(
            eq(doctorTimeBlocks.doctorId, doctorId),
            gte(doctorTimeBlocks.startAt, dayStart),
            lt(doctorTimeBlocks.startAt, dayEnd),
          ),
        ),
    ]);

    const error = validateTimeBlock({
      start,
      end,
      schedule,
      appointments: dayAppointments.map((a) => ({
        start: new Date(a.scheduledAt),
        end: new Date(new Date(a.scheduledAt).getTime() + (a.durationMinutes ?? 30) * 60_000),
      })),
      blocks: dayBlocks.map((b) => ({ start: new Date(b.startAt), end: new Date(b.endAt) })),
    });

    if (error) throw new Error(BLOCK_ERROR_MESSAGES[error]);

    const [block] = await db
      .insert(doctorTimeBlocks)
      .values({
        doctorId,
        startAt: start,
        endAt: end,
        reason: data.reason ?? null,
        createdByUserId: session.user.id,
      })
      .returning({ id: doctorTimeBlocks.id });

    return { id: block.id };
  });

export const getMyTimeBlocks = createServerFn({ method: "POST" })
  .inputValidator(z.object({ from: z.string(), to: z.string() }))
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();
    const { dayStart } = dayBounds(data.from);
    const { dayEnd } = dayBounds(data.to);

    return db
      .select({
        id: doctorTimeBlocks.id,
        startAt: doctorTimeBlocks.startAt,
        endAt: doctorTimeBlocks.endAt,
        reason: doctorTimeBlocks.reason,
      })
      .from(doctorTimeBlocks)
      .where(
        and(
          eq(doctorTimeBlocks.doctorId, doctorId),
          gte(doctorTimeBlocks.startAt, dayStart),
          lt(doctorTimeBlocks.startAt, dayEnd),
        ),
      );
  });

// Usada por pacientes y recepcion para calcular disponibilidad. Devuelve solo el
// rango horario: `reason` puede tener datos del paciente extraparticular y no
// debe salir de la sesion del medico.
export const getDoctorTimeBlocks = createServerFn({ method: "POST" })
  .inputValidator(z.object({ doctorId: z.string().uuid(), date: z.string() }))
  .handler(async ({ data }) => {
    await requireSession();
    const { dayStart, dayEnd } = dayBounds(data.date);

    return db
      .select({ startAt: doctorTimeBlocks.startAt, endAt: doctorTimeBlocks.endAt })
      .from(doctorTimeBlocks)
      .where(
        and(
          eq(doctorTimeBlocks.doctorId, data.doctorId),
          gte(doctorTimeBlocks.startAt, dayStart),
          lt(doctorTimeBlocks.startAt, dayEnd),
        ),
      );
  });

export const deleteTimeBlock = createServerFn({ method: "POST" })
  .inputValidator(z.object({ blockId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();
    const block = await db.query.doctorTimeBlocks.findFirst({
      where: eq(doctorTimeBlocks.id, data.blockId),
      columns: { doctorId: true },
    });
    if (!block) throw new Error("Bloqueo no encontrado");
    if (block.doctorId !== doctorId) throw new AuthError("FORBIDDEN", "No autorizado");

    await db.delete(doctorTimeBlocks).where(eq(doctorTimeBlocks.id, data.blockId));
    return { success: true };
  });
```

**Por qué `getDoctorTimeBlocks` no devuelve `reason`:** el motivo puede contener el nombre de un paciente extraparticular. Un paciente que consulta disponibilidad solo necesita saber que el horario no está libre.

- [ ] **Step 2: Extender `getDayAppointments`**

En `src/lib/api/appointments.functions.ts`, reemplazá el `return` del handler (líneas 263-277):

```ts
const [appts, blocks] = await Promise.all([
  db
    .select({
      scheduledAt: appointments.scheduledAt,
      durationMinutes: appointments.durationMinutes,
      status: appointments.status,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.doctorId, data.doctorId),
        gte(appointments.scheduledAt, dayStart),
        lt(appointments.scheduledAt, dayEnd),
        ne(appointments.status, "cancelado"),
      ),
    ),
  db
    .select({ startAt: doctorTimeBlocks.startAt, endAt: doctorTimeBlocks.endAt })
    .from(doctorTimeBlocks)
    .where(
      and(
        eq(doctorTimeBlocks.doctorId, data.doctorId),
        gte(doctorTimeBlocks.startAt, dayStart),
        lt(doctorTimeBlocks.startAt, dayEnd),
      ),
    ),
]);

return { appointments: appts, blocks };
```

Agregá `doctorTimeBlocks` al import de `@/db/schema` en la línea 4.

**Esto es un breaking change del contrato.** Los tres llamadores se arreglan en la Task 8. `tsc` los va a marcar — es la red de seguridad.

- [ ] **Step 3: Verificar tipos**

```bash
bunx tsc --noEmit
```

Esperado: errores **solo** en `dashboard.tsx`, `doctor.tsx` o `AgendaTab.tsx` y `staff.tsx`, por el cambio de forma del retorno. Son los que arregla la Task 8.

- [ ] **Step 4: Probar a mano contra la DB**

```bash
bun dev
```

Como médico, abrí la consola del navegador en `/doctor` y creá un bloque en un horario dentro de tu agenda:

```js
const { createTimeBlock } = await import("/src/lib/api/time-blocks.functions.ts");
await createTimeBlock({
  data: {
    startAt: new Date(2026, 7, 3, 9, 0).toISOString(),
    endAt: new Date(2026, 7, 3, 10, 0).toISOString(),
    reason: "prueba",
  },
});
```

Esperado: devuelve `{ id: "..." }`. Repetí el mismo llamado y esperá `Error: Ya tenés ese horario bloqueado`. Probá uno a las 22:00 y esperá `El horario está fuera de tu agenda configurada`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/time-blocks.functions.ts src/lib/api/appointments.functions.ts
git commit -m "feat(agenda): server fns de bloqueo y getDayAppointments devuelve bloques"
```

---

## Task 8: Integrar los bloques en el cálculo de slots

**Files:**

- Modify: `src/routes/dashboard.tsx:256-278`
- Modify: `src/components/doctor/AgendaTab.tsx` (era `doctor.tsx:1253-1270`)
- Modify: `src/routes/staff.tsx:407-420`

**Interfaces:**

- Consumes: `blocksToOccupied` de `@/lib/time-blocks`; el nuevo retorno de `getDayAppointments`.
- Produces: nada nuevo. Los tres llamadores quedan consistentes.

- [ ] **Step 1: Arreglar `AgendaTab.tsx`**

Reemplazá el bloque que construye `occupied`:

```tsx
const { appointments: existing, blocks } = await getDayAppointments({
  data: { doctorId, date: selectedDate },
});
const occupied = [
  ...(existing ?? [])
    .filter((a) => a.scheduledAt && a.status !== "cancelado")
    .map((a) => {
      const start = new Date(a.scheduledAt);
      const dur = Number(a.durationMinutes ?? slotMinutes) || slotMinutes;
      const end = new Date(start.getTime() + dur * 60_000);
      return { start, end };
    }),
  ...blocksToOccupied(
    (blocks ?? []).map((b) => ({ startAt: new Date(b.startAt), endAt: new Date(b.endAt) })),
  ),
];
```

Agregá el import:

```tsx
import { blocksToOccupied } from "@/lib/time-blocks";
```

- [ ] **Step 2: Arreglar `dashboard.tsx`**

Mismo patrón en las líneas 256-278. Ojo: la variable ahí se llama `dayAppts`, no `existing`. Leé el código antes de pegar.

- [ ] **Step 3: Arreglar `staff.tsx`**

Mismo patrón en las líneas 407-420.

- [ ] **Step 4: Verificar tipos y lint**

```bash
bunx tsc --noEmit
bun lint
bun test
```

Esperado: los tres limpios. Si `tsc` sigue marcando algún llamador, se te escapó uno.

- [ ] **Step 5: Smoke test end-to-end**

Con `bun dev` y el bloque de prueba de la Task 7 todavía cargado:

- Como **médico**, en "Nuevo turno" con esa fecha: el slot de las 09:00 **no** aparece.
- Como **paciente**, reservando con ese médico y esa fecha: el slot de las 09:00 **no** aparece.
- Como **recepcionista**, creando un turno: el slot de las 09:00 **no** aparece.
- Borrá el bloque con `deleteTimeBlock` y confirmá que el slot vuelve en los tres roles.

Los tres roles importan: si te olvidás uno, recepción puede sobreagendar sobre un bloqueo.

- [ ] **Step 6: Commit**

```bash
git add src/routes/dashboard.tsx src/routes/staff.tsx src/components/doctor/AgendaTab.tsx
git commit -m "feat(agenda): los bloqueos ocupan slots para medico, paciente y recepcion"
```

---

## Task 9: UI de bloqueo en la agenda del médico

**Files:**

- Create: `src/components/doctor/BlockSlotDialog.tsx`
- Modify: `src/components/doctor/AgendaTab.tsx`

**Interfaces:**

- Consumes: `createTimeBlock`, `getMyTimeBlocks`, `deleteTimeBlock` de `@/lib/api/time-blocks.functions`.
- Produces: `export function BlockSlotDialog({ open, onOpenChange, defaultDate, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; defaultDate?: string; onCreated: () => void })`.

No recibe `doctorId`: `createTimeBlock` lo deriva de la sesión vía `requireDoctor()`. Pasarlo desde el cliente sería un parámetro que el servidor tiene que ignorar por seguridad.

- [ ] **Step 1: Crear el diálogo**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import { createTimeBlock } from "@/lib/api/time-blocks.functions";

export function BlockSlotDialog({
  open,
  onOpenChange,
  defaultDate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate?: string;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(defaultDate ?? "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toLocalIso = (d: string, t: string) => {
    const [y, mo, dy] = d.split("-").map(Number);
    const [h, mi] = t.split(":").map(Number);
    return new Date(y, mo - 1, dy, h, mi, 0, 0).toISOString();
  };

  const handleSubmit = async () => {
    if (!date) return;
    setSubmitting(true);
    try {
      await createTimeBlock({
        data: {
          startAt: toLocalIso(date, startTime),
          endAt: toLocalIso(date, endTime),
          reason: reason.trim() || undefined,
        },
      });
      toast.success("Horario bloqueado");
      onOpenChange(false);
      setReason("");
      onCreated();
    } catch (e) {
      toastError(e, "No se pudo bloquear el horario");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bloquear horario</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="block-date">Fecha</Label>
            <Input
              id="block-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-[44px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="block-start">Desde</Label>
              <Input
                id="block-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-end">Hasta</Label>
              <Input
                id="block-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-reason">Motivo (opcional)</Label>
            <Input
              id="block-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Paciente particular, reunión, etc."
              maxLength={200}
              className="min-h-[44px]"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            El horario deja de ofrecerse a pacientes y a recepción. Si después querés registrar la
            atención, agregá el paciente desde la agenda.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !date}>
            {submitting ? "Bloqueando…" : "Bloquear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`toLocalIso` construye la fecha en hora local y recién ahí la pasa a ISO. Si concatenaras el string a mano (`${date}T${startTime}:00Z`) el bloque quedaría corrido 3 horas.

- [ ] **Step 2: Integrar en `AgendaTab`**

Agregá el botón junto a "Nuevo turno":

```tsx
<Button variant="outline" onClick={() => setBlockOpen(true)} className="min-h-[44px]">
  <Ban className="h-4 w-4 sm:mr-2" />
  <span className="hidden sm:inline">Bloquear horario</span>
</Button>
```

Importá `Ban` de `lucide-react`. Sumá el estado `const [blockOpen, setBlockOpen] = useState(false);` y renderizá el diálogo, pasándole como `onCreated` el refetch que ya usa la agenda para los turnos.

- [ ] **Step 3: Mostrar los bloqueos en la grilla**

Traé los bloques del rango visible en `AgendaTab`:

```tsx
const { data: timeBlocks, refetch: refetchBlocks } = useQuery({
  queryKey: ["my-time-blocks", rangeFrom, rangeTo],
  queryFn: () => getMyTimeBlocks({ data: { from: rangeFrom, to: rangeTo } }),
});
```

`rangeFrom` y `rangeTo` son las mismas fechas `YYYY-MM-DD` que ya usa la agenda para pedir turnos —
reusá esas variables, no calcules el rango de nuevo.

Creá el componente de tarjeta dentro de `AgendaTab.tsx`:

```tsx
function BlockCard({
  block,
  onDelete,
  onAddPatient,
}: {
  block: { id: string; startAt: string | Date; endAt: string | Date; reason: string | null };
  onDelete: (id: string) => void;
  onAddPatient: (id: string) => void;
}) {
  const start = new Date(block.startAt);
  const end = new Date(block.endAt);

  return (
    <div className="rounded-xl border border-dashed border-muted-foreground/40 bg-muted/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">Bloqueado</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {fmtTime(start)} – {fmtTime(end)}
          </p>
          {block.reason ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{block.reason}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="min-h-[44px] min-w-[44px]"
            aria-label="Agregar paciente a este bloqueo"
            onClick={() => onAddPatient(block.id)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="min-h-[44px] min-w-[44px]"
            aria-label="Eliminar bloqueo"
            onClick={() => onDelete(block.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Importá `Ban`, `Plus` y `Trash2` de `lucide-react`, y `fmtTime` de `@/components/doctor/shared`.

El handler de borrado:

```tsx
const handleDeleteBlock = async (id: string) => {
  try {
    await deleteTimeBlock({ data: { blockId: id } });
    toast.success("Bloqueo eliminado");
    refetchBlocks();
  } catch (e) {
    toastError(e, "No se pudo eliminar el bloqueo");
  }
};
```

Renderizá las tarjetas en la vista Día, junto a los turnos, ordenadas por `startAt`.

**No uses solo el color para distinguir un bloqueo de un turno.** El ícono lleva `aria-hidden` y la
palabra "Bloqueado" es texto real: es lo que hace que funcione con lector de pantalla y con daltonismo.
Es el requisito de contraste AA del spec (§10).

`onAddPatient` queda cableado en la Task 10; por ahora dejalo como `() => {}` y el botón deshabilitado.

- [ ] **Step 4: Verificar**

```bash
bunx tsc --noEmit
bun lint
bun test
```

- [ ] **Step 5: Smoke test**

- "Bloquear horario" abre el diálogo; se crea el bloque y aparece en la grilla.
- Intentar bloquear sobre un turno existente muestra "Ya hay un turno agendado en ese horario".
- Intentar bloquear fuera del horario muestra "El horario está fuera de tu agenda configurada".
- El botón de borrar elimina el bloque y el slot vuelve a ofrecerse.
- En viewport de 375 px el diálogo se ve completo y los campos son tocables.

- [ ] **Step 6: Commit**

```bash
git add src/components/doctor/BlockSlotDialog.tsx src/components/doctor/AgendaTab.tsx
git commit -m "feat(agenda): UI para bloquear y desbloquear horarios"
```

---

## Task 10: Alta rápida de paciente y promoción a turno

La parte más delicada de la fase: crea filas en `user`, `patients` y `appointments`, y borra el bloque. Todo en una transacción.

**Files:**

- Modify: `src/lib/api/time-blocks.functions.ts`
- Create: `src/components/doctor/QuickPatientDialog.tsx`
- Modify: `src/components/doctor/AgendaTab.tsx`

**Interfaces:**

- Consumes: `hashPassword` de `@/lib/password`; `user`, `account`, `patients`, `appointments`, `doctorTimeBlocks`, `doctors` de `@/db/schema`.
- Produces: `promoteBlockToAppointment({ data: { blockId: string; firstName: string; lastName: string; documentNumber: string; phone: string; specialtyId: string } })` → `{ appointmentId: string; patientUserId: string }`.

- [ ] **Step 1: Agregar la server fn**

En `src/lib/api/time-blocks.functions.ts`:

```ts
// Alta rapida de un paciente extraparticular sobre un bloqueo existente. El bloqueo
// se PROMUEVE a turno real (status completado) y se elimina, de modo que la ficha
// clinica posterior no necesita ninguna rama especial: cuelga de un appointment
// como cualquier otra. Ver docs/10-modulo-clinico.md §8.
export const promoteBlockToAppointment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      blockId: z.string().uuid(),
      firstName: z.string().min(1).max(80),
      lastName: z.string().min(1).max(80),
      documentNumber: z.string().min(6).max(15).regex(/^\d+$/, "El DNI debe ser numérico"),
      phone: z.string().min(6).max(30),
      specialtyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const { doctorId } = await requireDoctor();

    const block = await db.query.doctorTimeBlocks.findFirst({
      where: eq(doctorTimeBlocks.id, data.blockId),
    });
    if (!block) throw new Error("Bloqueo no encontrado");
    if (block.doctorId !== doctorId) throw new AuthError("FORBIDDEN", "No autorizado");

    const existingPatient = await db.query.patients.findFirst({
      where: eq(patients.documentNumber, data.documentNumber),
    });

    const durationMinutes = Math.max(
      1,
      Math.round((block.endAt.getTime() - block.startAt.getTime()) / 60_000),
    );

    return db.transaction(async (tx) => {
      let patientUserId: string;

      if (existingPatient) {
        // El paciente ya existe: se reutiliza, no se duplica ni se pisa nada.
        patientUserId = existingPatient.userId;
      } else {
        const userId = crypto.randomUUID();
        // `user.email` es notNull unique y el alta rapida no pide email. Se deriva
        // del DNI en un dominio interno que no resuelve, para que nunca se le mande
        // correo. `isActive: false` deja la cuenta sin poder iniciar sesion hasta que
        // la recepcion la complete. Esto NO toca el login de pacientes.
        const placeholderEmail = `dni-${data.documentNumber}@caif.local`;
        const passwordHash = await hashPassword(crypto.randomUUID());

        await tx.insert(user).values({
          id: userId,
          email: placeholderEmail,
          firstName: data.firstName,
          lastName: data.lastName,
          name: `${data.firstName} ${data.lastName}`,
          phone: data.phone,
          role: "paciente",
          mustChangePassword: true,
          isActive: false,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await tx.insert(account).values({
          id: crypto.randomUUID(),
          userId,
          accountId: placeholderEmail,
          providerId: "credential",
          password: passwordHash,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await tx.insert(patients).values({
          userId,
          documentNumber: data.documentNumber,
        });

        patientUserId = userId;
      }

      const [appointment] = await tx
        .insert(appointments)
        .values({
          patientId: patientUserId,
          doctorId,
          specialtyId: data.specialtyId,
          scheduledAt: block.startAt,
          durationMinutes,
          status: "completado",
          notes: block.reason ?? null,
        })
        .returning({ id: appointments.id });

      await tx.delete(doctorTimeBlocks).where(eq(doctorTimeBlocks.id, data.blockId));

      return { appointmentId: appointment.id, patientUserId };
    });
  });
```

Sumá a los imports del archivo:

```ts
import { user, account, patients } from "@/db/schema";
import { hashPassword } from "@/lib/password";
```

Tres decisiones que importan:

- **Se reutiliza el paciente si el DNI ya existe.** `patients.documentNumber` tiene índice único (`patients_dni_idx`); insertar duplicado explotaría con un 23505 crudo.
- **La contraseña es un UUID aleatorio descartado.** No hay que dársela a nadie: la cuenta está `isActive: false`. Se genera igual porque `account.password` es parte del contrato de better-auth.
- **`status: "completado"`.** El bloqueo representa una atención que ya ocurrió. No pasa por `isValidTransition` porque es una inserción, no un cambio de estado.

- [ ] **Step 2: Crear el diálogo**

`src/components/doctor/QuickPatientDialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toastError } from "@/lib/toastError";
import { promoteBlockToAppointment } from "@/lib/api/time-blocks.functions";
import { getAllSpecialties } from "@/lib/api/specialties.functions";

type Specialty = { id: string; name: string };

export function QuickPatientDialog({
  blockId,
  onOpenChange,
  onPromoted,
}: {
  blockId: string | null;
  onOpenChange: (v: boolean) => void;
  onPromoted: () => void;
}) {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [specialtyId, setSpecialtyId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getAllSpecialties()
      .then((s) => {
        setSpecialties(s);
        if (s.length === 1) setSpecialtyId(s[0].id);
      })
      .catch(console.error);
  }, []);

  const reset = () => {
    setFirstName("");
    setLastName("");
    setDocumentNumber("");
    setPhone("");
  };

  const valid =
    firstName.trim() &&
    lastName.trim() &&
    /^\d{6,15}$/.test(documentNumber) &&
    phone.trim() &&
    specialtyId;

  const handleSubmit = async () => {
    if (!blockId || !valid) return;
    setSubmitting(true);
    try {
      await promoteBlockToAppointment({
        data: {
          blockId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          documentNumber,
          phone: phone.trim(),
          specialtyId,
        },
      });
      toast.success("Paciente agregado y turno registrado");
      onOpenChange(false);
      reset();
      onPromoted();
    } catch (e) {
      toastError(e, "No se pudo agregar el paciente");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={blockId !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar paciente</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Se va a crear una cuenta de paciente con estos datos y el bloqueo pasa a ser un turno
          atendido. Recién entonces vas a poder escribir la ficha.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qp-first">Nombre</Label>
              <Input
                id="qp-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={80}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qp-last">Apellido</Label>
              <Input
                id="qp-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={80}
                className="min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qp-dni">DNI</Label>
            <Input
              id="qp-dni"
              inputMode="numeric"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value.replace(/\D/g, ""))}
              maxLength={15}
              className="min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground">
              Si el DNI ya existe en el sistema, se usa esa cuenta en vez de crear una nueva.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qp-phone">Teléfono</Label>
            <Input
              id="qp-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qp-specialty">Especialidad</Label>
            <Select value={specialtyId} onValueChange={setSpecialtyId}>
              <SelectTrigger id="qp-specialty" className="min-h-[44px]">
                <SelectValue placeholder="Elegí una especialidad" />
              </SelectTrigger>
              <SelectContent>
                {specialties.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !valid}>
            {submitting ? "Guardando…" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

El `replace(/\D/g, "")` en el DNI evita que el usuario llegue al servidor con letras — el validador
zod es la defensa real, esto es solo para que el error no ocurra.

- [ ] **Step 3: Integrar en la grilla**

En `AgendaTab`, sumá el estado y el diálogo:

```tsx
const [promotingBlockId, setPromotingBlockId] = useState<string | null>(null);
```

Cableá el `onAddPatient` de `BlockCard` (que en la Task 9 quedó como `() => {}`):

```tsx
<BlockCard
  key={block.id}
  block={block}
  onDelete={handleDeleteBlock}
  onAddPatient={setPromotingBlockId}
/>
```

Y renderizá el diálogo al final del componente:

```tsx
<QuickPatientDialog
  blockId={promotingBlockId}
  onOpenChange={(v) => {
    if (!v) setPromotingBlockId(null);
  }}
  onPromoted={() => {
    setPromotingBlockId(null);
    refetchBlocks();
    refetchAppointments();
  }}
/>
```

`refetchAppointments` es el refetch que la agenda ya usa para los turnos — reusá esa variable.
**Los dos refetch son obligatorios:** si solo refrescás uno, el bloque sigue en pantalla o el turno
nuevo no aparece.

Sacá el `disabled` del botón "Agregar paciente" de `BlockCard`.

- [ ] **Step 4: Verificar**

```bash
bunx tsc --noEmit
bun lint
bun test
```

- [ ] **Step 5: Smoke test de la transacción**

1. Creá un bloque de 09:00 a 09:30.
2. "Agregar paciente" con un DNI nuevo. Confirmá que el bloque desaparece y aparece un turno completado a las 09:00.
3. Verificá en la DB:

```bash
docker compose exec -T db psql -U postgres -d postgres -c \
  "select u.first_name, u.email, u.is_active, p.document_number, a.status, a.scheduled_at
   from appointments a
   join \"user\" u on u.id = a.patient_id
   join patients p on p.user_id = u.id
   order by a.created_at desc limit 1;"
```

Esperado: `is_active = f`, email `dni-<numero>@caif.local`, status `completado`.

4. Repetí con el **mismo DNI** sobre otro bloque. Esperado: no se crea un usuario nuevo, se reutiliza el existente y se crea un segundo turno.
5. Probá con un DNI con letras. Esperado: el validador lo rechaza antes de tocar la DB.
6. **Verificá que la cuenta no puede loguearse:** intentá entrar con `dni-<numero>@caif.local`. Debe fallar por `isActive: false`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/time-blocks.functions.ts src/components/doctor/QuickPatientDialog.tsx src/components/doctor/AgendaTab.tsx
git commit -m "feat(agenda): alta rapida de paciente extraparticular con promocion del bloqueo a turno"
```

---

## Verificación final de las Fases 0 y 1

- [ ] **Suite completa**

```bash
bun lint
bunx tsc --noEmit
bun test
bun build
```

Los cuatro limpios. `bun test` tiene que incluir los 16 tests de `time-blocks` y los 4 de weekday (si se hizo la Task 4).

- [ ] **Criterios de aceptación del spec (§"Agenda")**

- [ ] Un slot bloqueado no se ofrece a pacientes ni a recepción.
- [ ] Al agregar paciente sobre un bloque, se crea el turno y el bloque desaparece.
- [ ] Un bloque sin paciente no permite crear ficha (se cumple por construcción: no hay ficha en esta fase).

- [ ] **Verificación de no-regresión del refactor**

Recorré `/doctor` completo con la consola del navegador abierta: los seis tabs, la creación de un turno, el cambio de estado de un turno, la subida y visualización de un archivo, la edición de horarios. Cero errores en consola.

- [ ] **Chequeo de seguridad**

Desde la sesión de un médico A, llamá `deleteTimeBlock` con el `blockId` de un médico B. Esperado: `AuthError` con code `FORBIDDEN`.

- [ ] **Chequeo previo al deploy**

```bash
bunx drizzle-kit push --dry-run 2>/dev/null || bun db:push
```

Confirmá que la única operación pendiente es `CREATE TABLE doctor_time_blocks`. Si aparece cualquier `ALTER` o `DROP` sobre otra tabla, **no deployés**: violaría el congelamiento de datos.

Deployar entre 21:00 y 08:00 ARG.

---

## Cómo ejecutarlo con Claude Code

**No pasar las 10 tareas en una sola sesión.** `doctor.tsx` tiene 1474 líneas y el refactor solo ya
consume mucho contexto. Además, una sesión que refactoriza y agrega features al mismo tiempo produce
un diff donde no se distingue qué cambió por mudanza y qué cambió por feature.

| Sesión | Tareas | Corte                                                                  |
| ------ | ------ | ---------------------------------------------------------------------- |
| 1      | 1–3    | Fase 0 completa. Refactor puro, sin schema, deployable por sí solo     |
| 2      | 4–8    | Bugfix de weekday + funciones puras + tabla + server fns + integración |
| 3      | 9–10   | UI de bloqueo y alta rápida                                            |

Entre sesión y sesión: `bun lint && bunx tsc --noEmit && bun test && bun build`, commit, y arrancar
la siguiente con el contexto limpio.

### Prompt de la sesión 1

```
Vas a ejecutar las Tasks 1 a 3 de un plan ya escrito para CAIF (sistema de turnos
de un consultorio médico). El diseño y la planificación ya están hechos: no
propongas alternativas de arquitectura, seguí el plan.

Leé en este orden antes de tocar código:
1. CLAUDE.md — stack, comandos (Bun, nunca npm) y "Deployment caution".
2. docs/README.md — sección "Restricciones globales".
3. docs/superpowers/plans/2026-08-02-modulo-clinico-fase-0-1.md — el plan.
   Leé "Global Constraints" y "File Structure" completos, después las Tasks 1, 2 y 3.

Alcance de esta sesión: SOLO las Tasks 1, 2 y 3 (Fase 0). Son refactor puro:
extraer los tabs de src/routes/doctor.tsx (1474 líneas) a src/components/doctor/*.
NO empieces la Task 4 ni ninguna posterior.

Regla dura del refactor: mové el código VERBATIM. Cero mejoras de paso, cero
renombres que el plan no pida, cero cambios de comportamiento. La única excepción
son los renombres que el plan indica explícitamente (MedicalRecordsTab → ArchivosTab,
la etiqueta visible "Fichas Médicas" → "Archivos", y el import dinámico de
getDoctorSchedule que pasa a estático). Si ves algo que te parece mejorable,
anotalo al final y no lo toques.

Cada Task termina con su commit. No agrupes los tres en uno.

Antes de cada commit: bunx tsc --noEmit && bun lint && bun test. Los tres limpios.
Si bun lint se queja de prettier/prettier, corré bun format.

Los smoke tests manuales que pide el plan no los podés correr vos. Cuando llegues
a uno, pará y decime exactamente qué tengo que probar.

Empezá por el Step 1 de la Task 1, que es verificar que el árbol está limpio. Si
bun test ya falla antes de que toques nada, pará y avisame.
```

### Prompt de la sesión 2

Antes de arrancarla hay que **decidir qué se hace con la Task 4** (ver "Hallazgo previo"). El prompt
cambia según eso:

```
Vas a ejecutar las Tasks 4 a 8 del plan
docs/superpowers/plans/2026-08-02-modulo-clinico-fase-0-1.md.
La Fase 0 (Tasks 1-3) ya está mergeada.

Leé antes de tocar código: CLAUDE.md, docs/README.md ("Restricciones globales"),
docs/10-modulo-clinico.md (el spec, para entender el porqué) y el plan completo.

Alcance: SOLO las Tasks 4 a 8. No empieces la Task 9.

[SI LA TASK 4 SE APRUEBA:]
La Task 4 corrige un bug real de producción en isWithinDoctorSchedule. Hacela
primero: sin ella la validación de bloqueos de la Task 5 falla.

[SI LA TASK 4 SE POSPONE:]
NO hagas la Task 4. En su lugar, hacé que validateTimeBlock no dependa de
isWithinDoctorSchedule: implementá la comprobación de horario adentro de
src/lib/time-blocks.ts usando la convención lunes = 0, con los mismos tests.

RESTRICCIÓN DURA: estamos a mitad de la carga de datos de médicos en producción.
`bunx drizzle-kit push` corre en cada deploy y auto-aplica schema.ts contra prod.
Solo cambios ADITIVOS: la tabla doctor_time_blocks es nueva y no toca nada existente.
Si al correr bun db:push ves cualquier ALTER o DROP sobre otra tabla, pará y avisame.

TDD estricto en la Task 5: escribí los tests primero, corrélos y verificá que
fallan, después implementá. No al revés.

Cada Task termina con su commit. Antes de cada uno: bunx tsc --noEmit && bun lint
&& bun test.
```

### Prompt de la sesión 3

```
Vas a ejecutar las Tasks 9 y 10 del plan
docs/superpowers/plans/2026-08-02-modulo-clinico-fase-0-1.md.
Las Tasks 1 a 8 ya están mergeadas.

Leé antes de tocar código: CLAUDE.md (prestá atención a "Mobile Responsive
Conventions"), el plan completo, y docs/10-modulo-clinico.md §8 y §10.

Alcance: SOLO las Tasks 9 y 10. Con esto se cierra la Fase 1.

El plan trae el código de los componentes. Usalo tal cual salvo que no compile
contra el código real; si tenés que desviarte, decime qué cambiaste y por qué.

La Task 10 crea filas en user, account, patients y appointments dentro de una
transacción. Es la parte más delicada: no la partas en varias operaciones sueltas.

Accesibilidad, no es opcional: los bloqueos se distinguen por texto ("Bloqueado"),
no solo por color; los botones de solo ícono llevan min-h-[44px] min-w-[44px] y
aria-label.

Al terminar, recorré la sección "Verificación final de las Fases 0 y 1" del plan
y decime qué pasó y qué necesitás que pruebe yo a mano.
```

## Qué sigue

Las fases 2 a 6 del spec son entregables independientes y llevan su propio plan:

| Plan                         | Cubre                                                            | Depende de  |
| ---------------------------- | ---------------------------------------------------------------- | ----------- |
| `…-fase-2-nucleo-clinico.md` | Notas, timeline, editor Tiptap, firma, permisos por especialidad | Fases 0 y 1 |
| `…-fase-3-accesos.md`        | Notificaciones, pedidos cross-especialidad, admin, sucesión      | Fase 2      |
| `…-fase-4-paciente.md`       | Historia clínica del paciente, liberación controlada             | Fase 3      |
| `…-fase-5-voz.md`            | Dictado con Web Speech API                                       | Fase 2      |
| `…-fase-6-export.md`         | PDF por nota, auditoría de impresión, pulido a11y                | Fase 4      |

Cada uno se escribe cuando la fase anterior está mergeada, para que refleje el estado real del código y no una proyección.
