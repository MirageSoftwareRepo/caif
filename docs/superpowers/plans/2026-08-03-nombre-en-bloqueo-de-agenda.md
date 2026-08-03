# Nombre en el bloqueo de agenda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el texto que el médico escribe al bloquear un horario se vea en la grilla del día, para saber quién ocupa ese slot cuando la persona todavía no tiene cuenta.

**Architecture:** El dato ya existe de punta a punta (`doctor_time_blocks.reason` → `getMyTimeBlocks` → `DayGridBlock.reason`). Lo único que falta es que la grilla lo pinte en vez del literal `"Bloqueado"`. Se agrega una función pura `blockLabel` en `src/lib/time-blocks.ts` para que la regla de fallback tenga test propio sin montar componentes, siguiendo el patrón que ya usa ese archivo con `blocksToOccupied` y `validateTimeBlock`. Después se consume desde `DayGrid.tsx` y se ajusta la copy del diálogo.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Start, Tailwind, Vitest (jsdom).

Spec: `docs/superpowers/specs/2026-08-03-nombre-en-bloqueo-de-agenda-design.md`

## Global Constraints

- Sin migración de base de datos. No se toca `src/db/schema.ts`.
- Sin cambios en server functions. No se toca `src/lib/api/time-blocks.functions.ts`.
- El bloqueo sigue sin crear cuenta, turno ni ficha clínica.
- No se toca `src/components/agenda/WeekView.tsx` (hoy no dibuja bloqueos).
- Recepción sigue sin ver bloqueos: no se toca el filtro `variant === "doctor"` de `DayGrid.tsx:195`.
- Comentarios y copy de UI en español rioplatense, igual que el resto del repo.
- Texto exacto del recordatorio, sin reformular: `Por favor solicitar al cliente la creación de un usuario.`
- Límite del campo: 200 caracteres (`maxLength={200}`), ya existente. No se cambia.
- Tests con Vitest: `bun run test` (o `npx vitest run`).

---

### Task 1: Función pura `blockLabel`

Regla de negocio en un solo lugar: qué texto muestra un bloqueo. Va en `src/lib/time-blocks.ts` porque ahí ya viven las funciones puras del bloqueo, sin acceso a DB ni red.

**Files:**
- Modify: `src/lib/time-blocks.ts` (agregar al final del archivo)
- Test: `src/test/time-blocks.test.ts` (agregar un `describe` al final)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `blockLabel(reason: string | null | undefined): string` — exportada desde `@/lib/time-blocks`. Devuelve `reason` sin espacios sobrantes, o `"Bloqueado"` si viene vacío, solo espacios, `null` o `undefined`. La consume la Task 2.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `src/test/time-blocks.test.ts`:

```typescript
describe("blockLabel", () => {
  it("devuelve el texto del bloqueo cuando hay uno", () => {
    expect(blockLabel("Juana Pérez")).toBe("Juana Pérez");
  });

  it("recorta espacios sobrantes", () => {
    expect(blockLabel("  Juana Pérez  ")).toBe("Juana Pérez");
  });

  it("cae en 'Bloqueado' cuando el motivo es null", () => {
    expect(blockLabel(null)).toBe("Bloqueado");
  });

  it("cae en 'Bloqueado' cuando el motivo es undefined", () => {
    expect(blockLabel(undefined)).toBe("Bloqueado");
  });

  it("cae en 'Bloqueado' cuando el motivo es una cadena vacia", () => {
    expect(blockLabel("")).toBe("Bloqueado");
  });

  it("cae en 'Bloqueado' cuando el motivo son solo espacios", () => {
    expect(blockLabel("   ")).toBe("Bloqueado");
  });
});
```

Y actualizar la línea 2 del mismo archivo para importar la función nueva:

```typescript
import { blockLabel, blocksToOccupied, validateTimeBlock } from "@/lib/time-blocks";
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/test/time-blocks.test.ts`
Expected: FAIL. El error es de import/TypeScript: `blockLabel` no está exportada desde `@/lib/time-blocks`.

- [ ] **Step 3: Implementar**

Agregar al final de `src/lib/time-blocks.ts`:

```typescript
// Etiqueta visible de un bloqueo en la grilla. El medico puede escribir ahi el
// nombre de alguien que ocupa el horario pero todavia no tiene cuenta; si no
// escribio nada, el bloqueo se sigue mostrando como "Bloqueado".
export const BLOCK_FALLBACK_LABEL = "Bloqueado";

export function blockLabel(reason: string | null | undefined): string {
  return reason?.trim() || BLOCK_FALLBACK_LABEL;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/test/time-blocks.test.ts`
Expected: PASS. Los `describe` de `blocksToOccupied` y `validateTimeBlock` que ya existían siguen pasando.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time-blocks.ts src/test/time-blocks.test.ts
git commit -m "feat(agenda): funcion pura blockLabel con fallback a Bloqueado"
```

---

### Task 2: La grilla muestra la etiqueta del bloqueo

**Files:**
- Modify: `src/components/agenda/DayGrid.tsx` (import nuevo + línea 385)

**Interfaces:**
- Consumes: `blockLabel` de `@/lib/time-blocks` (Task 1).
- Produces: nada que consuman tareas posteriores.

- [ ] **Step 1: Agregar el import**

En `src/components/agenda/DayGrid.tsx`, junto al resto de los imports de `@/lib`:

```typescript
import { blockLabel } from "@/lib/time-blocks";
```

- [ ] **Step 2: Reemplazar el literal por la etiqueta**

Buscar en `DayGrid.tsx` (alrededor de la línea 385, dentro de `blocks.map`):

```tsx
                <span className="truncate font-medium text-foreground">Bloqueado</span>
```

Reemplazar por:

```tsx
                <span className="truncate font-medium text-foreground" title={blockLabel(block.reason)}>
                  {blockLabel(block.reason)}
                </span>
```

El `title` es para que un nombre largo, que la grilla trunca con `truncate`, se pueda leer completo al pasar el mouse. No se toca nada más del bloque: ni el ícono `Ban`, ni los botones de agregar paciente y eliminar, ni el borde punteado, ni la línea del rango horario que aparece solo si `pxHeight > 32`.

- [ ] **Step 3: Verificar que compila y que no rompió nada**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run`
Expected: PASS en toda la suite.

Run: `npx eslint src/components/agenda/DayGrid.tsx src/lib/time-blocks.ts`
Expected: sin errores.

- [ ] **Step 4: Verificación manual en el navegador**

Levantar el proyecto (`bun run dev`), entrar como médico a la agenda y comprobar los dos casos:

1. Crear un bloqueo escribiendo `Juana Pérez` en el campo de motivo. En la grilla del día, el bloque tiene que decir `Juana Pérez`.
2. Crear otro bloqueo dejando el campo vacío. Ese bloque tiene que seguir diciendo `Bloqueado`.

En ambos casos el bloque conserva el borde punteado y el fondo gris, y siguen funcionando el botón `+` (agregar paciente) y el tacho (eliminar bloqueo).

- [ ] **Step 5: Commit**

```bash
git add src/components/agenda/DayGrid.tsx
git commit -m "feat(agenda): la grilla muestra el nombre escrito en el bloqueo"
```

---

### Task 3: El diálogo invita a escribir un nombre y recuerda pedir el usuario

**Files:**
- Modify: `src/components/doctor/BlockSlotDialog.tsx` (bloque del campo `reason`, ~líneas 99-115)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: nada que consuman tareas posteriores.

No cambia ni el estado `reason`, ni `maxLength`, ni la validación, ni `handleSubmit`. Es solo copy.

- [ ] **Step 1: Cambiar el label, el placeholder y sumar el recordatorio**

Buscar en `src/components/doctor/BlockSlotDialog.tsx`:

```tsx
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
```

Reemplazar por:

```tsx
          <div className="space-y-2">
            <Label htmlFor="block-reason">Paciente o motivo (opcional)</Label>
            <Input
              id="block-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nombre del paciente, reunión, etc."
              maxLength={200}
              className="min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground">
              Si es un paciente sin cuenta, escribí su nombre para reconocerlo en la agenda. Por
              favor solicitar al cliente la creación de un usuario.
            </p>
          </div>
```

El párrafo explicativo que ya estaba al pie del diálogo ("El horario deja de ofrecerse a pacientes y a recepción...") queda tal cual, no se toca ni se mueve.

- [ ] **Step 2: Verificar que compila y pasa el lint**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint src/components/doctor/BlockSlotDialog.tsx`
Expected: sin errores.

- [ ] **Step 3: Verificación manual**

Abrir **Bloquear horario** en la agenda del médico y comprobar:

1. El label dice `Paciente o motivo (opcional)`.
2. El placeholder del input dice `Nombre del paciente, reunión, etc.`.
3. Debajo del input se lee el recordatorio con el texto `Por favor solicitar al cliente la creación de un usuario.`
4. El campo sigue siendo opcional: se puede bloquear sin escribir nada.

- [ ] **Step 4: Correr la suite completa**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/doctor/BlockSlotDialog.tsx
git commit -m "feat(agenda): el bloqueo pide el nombre del paciente y recuerda crear el usuario"
```

---

### Task 4: Actualizar el CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Leer el formato actual**

Run: `head -30 CHANGELOG.md`

Copiar el estilo de las entradas existentes (encabezado de versión o fecha, viñetas). No inventar un formato nuevo.

- [ ] **Step 2: Agregar la entrada**

Sumar una viñeta en la sección más reciente, respetando el formato que viste en el paso anterior:

```markdown
- Agenda: el texto que el médico escribe al bloquear un horario ahora se ve en la grilla del día, para identificar a un paciente que todavía no tiene cuenta. El campo pasa a llamarse "Paciente o motivo" e incluye el recordatorio de solicitar la creación del usuario.
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog de nombre visible en el bloqueo de agenda"
```

---

## Verificación final

- [ ] `npx tsc --noEmit` sin errores
- [ ] `npx vitest run` en verde, incluidos los 6 casos nuevos de `blockLabel`
- [ ] `npx eslint .` sin errores nuevos
- [ ] `npx vite build` termina sin errores
- [ ] Bloqueo con nombre → la grilla muestra el nombre
- [ ] Bloqueo sin nombre → la grilla muestra `Bloqueado`
- [ ] El botón `+` sigue abriendo `QuickPatientDialog` y promoviendo el bloqueo a turno
- [ ] El tacho sigue borrando el bloqueo
- [ ] Recepción sigue sin ver bloqueos en su agenda

## Fuera de alcance (registrado, no es un olvido)

- `WeekView.tsx` no dibuja bloqueos. Si más adelante se quiere ver el nombre en la vista semanal, es otro plan.
- Precargar el nombre del bloqueo en `QuickPatientDialog` al promover: requeriría partir texto libre en nombre y apellido. Descartado por frágil.
