# Nombre del paciente en el bloqueo de agenda

Fecha: 2026-08-03
Estado: aprobado, pendiente de plan de implementación

## Problema

Cuando un médico atiende a alguien que todavía no tiene cuenta en el sistema, hoy bloquea
el horario para que deje de ofrecerse a pacientes y a recepción. El bloqueo cumple su
función de ocupar el slot, pero en la grilla aparece como `Bloqueado` a secas: no hay
forma de saber de un vistazo quién ocupa ese horario.

El médico necesita que esa persona tenga "entidad" en la agenda —un nombre visible—
hasta que se le cree la cuenta.

## Alcance

Dentro:

- Mostrar el texto del bloqueo en la grilla del día.
- Reformular el campo del diálogo de bloqueo para que se entienda que ahí va un nombre.
- Recordatorio visible al médico para que pida la creación del usuario.

Fuera (decidido explícitamente, no es un olvido):

- No se crea cuenta de paciente, ni turno, ni ficha clínica. El bloqueo sigue siendo
  solo un bloqueo. Para formalizar la atención ya existe "Agregar paciente"
  (`QuickPatientDialog`), que sí crea la cuenta y promueve el bloqueo a turno.
- No se toca `WeekView.tsx`, que hoy no dibuja bloqueos en absoluto.
- Recepción sigue sin ver los bloqueos: `DayGrid.tsx` los filtra a `variant === "doctor"`.
  El nombre queda visible solo para el médico dueño de la agenda.

## Hallazgo: el dato ya existe

No hace falta migración ni server fn nueva. La cadena está entera y solo falta el último paso:

| Capa | Estado |
|---|---|
| `BlockSlotDialog.tsx:100` — campo "Motivo (opcional)" | ya existe |
| `schema.ts:151` — columna `reason text` en `doctor_time_blocks` | ya existe |
| `time-blocks.functions.ts:116` — `getMyTimeBlocks` devuelve `reason` | ya existe |
| `DayGrid.tsx:42` — `DayGridBlock.reason` tipado y propagado | ya existe |
| `DayGrid.tsx:385` — el bloque pinta el literal `"Bloqueado"` | **ignora `reason`** |

## Diseño

### 1. La grilla muestra el texto del bloqueo

En `DayGrid.tsx`, el título del bloque pasa a ser `block.reason`. Si es `null` o queda
vacío después de un `trim()`, se muestra `Bloqueado` como fallback.

- Una sola línea, truncada (`truncate`), igual que hoy.
- El ícono `Ban` y los botones de agregar paciente y eliminar no se mueven.
- La segunda línea con el rango horario sigue apareciendo solo si el bloque supera los
  32px de alto. En un bloqueo de 15 minutos se ve el nombre y nada más.
- El bloque conserva el borde punteado y el fondo `muted`: se sigue leyendo como
  bloqueo, no como turno real.

Criterio de aceptación: un bloqueo creado con el texto `Juana Pérez` se ve como
`Juana Pérez` en la grilla del día; uno creado sin texto se sigue viendo como `Bloqueado`.

### 2. El diálogo invita a escribir un nombre

En `BlockSlotDialog.tsx`:

- Label: `Paciente o motivo (opcional)`
- Placeholder: `Nombre del paciente, reunión, etc.`

Sigue siendo opcional y sigue siendo el mismo campo `reason`. No cambia la validación
ni el límite de 200 caracteres.

### 3. Recordatorio de creación de usuario

Debajo del campo, como texto de ayuda:

> Por favor solicitar al cliente la creación de un usuario.

Va en el diálogo de bloqueo, que es donde el médico está escribiendo el nombre de alguien
sin cuenta — el momento exacto en que el recordatorio es accionable. Se suma al texto
explicativo que ya está al pie del diálogo, no lo reemplaza.

## Qué pasa después, sin cambios

`promoteBlockToAppointment` ya copia `block.reason` a `appointments.notes`
(`time-blocks.functions.ts:254`). O sea: si el médico escribe el nombre en el bloqueo y
más tarde formaliza el turno con "Agregar paciente", ese texto queda como nota del turno.
Es el comportamiento actual y sirve como rastro. No se toca.

## Privacidad

El nombre de una persona sin cuenta queda en texto plano en `doctor_time_blocks.reason`,
visible solo para el médico dueño de la agenda. Es exactamente lo que ya pasa hoy con el
campo "Motivo" — el cambio no amplía quién puede ver el dato, solo lo hace visible en la
grilla para quien ya podía consultarlo.

## Testing

La regla de fallback vive en una función pura `blockLabel(reason)` en `src/lib/time-blocks.ts`,
junto a `blocksToOccupied` y `validateTimeBlock`. Se testea con Vitest en
`src/test/time-blocks.test.ts`: texto normal, texto con espacios sobrantes, `null`, `undefined`,
cadena vacía y solo espacios.

Montar `DayGrid` en un test exigiría mockear popovers y server functions para verificar una
sola cadena de texto; no vale la pena. El renderizado se valida a mano: crear un bloqueo con
nombre y confirmar que se ve en la grilla, crear uno sin nombre y confirmar el fallback.

No hace falta test de servidor: no cambia ninguna server fn ni el esquema.

## Riesgos

Bajo. Dos archivos de UI, sin migración, sin cambio de contrato de datos. El peor caso es
un nombre largo que se trunca — aceptable y consistente con el resto de la grilla.
