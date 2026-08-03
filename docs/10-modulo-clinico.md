# Plan 10 — Módulo clínico: historia por sesiones, permisos por especialidad y dictado

> **Leé primero [`00-RELEVAMIENTO.md`](00-RELEVAMIENTO.md) y las restricciones globales de [`README.md`](README.md).**
> Feature nueva pedida por el cliente. Reemplaza el flujo de "fichas médicas" actual (subir PDF)
> por una historia clínica nativa, sin eliminar los archivos adjuntos.
>
> **Schema 100 % aditivo.** No modifica ni borra filas existentes, por lo que es compatible con la
> fase de carga de médicos (§4.7) y con el `drizzle-kit push` automático del deploy.
>
> Depende de: nada. Rinde más después del **06** (módulo de slots, ya implementado) y se solapa
> con el **07** (refactor de componentes) y el **09** (rediseño UX) — ver §"Solapamientos".

## Objetivo

Reemplazar el sistema de fichas médicas (hoy: subida de PDF con versionado) por una **historia
clínica por sesiones**: un timeline por paciente donde el médico escribe cada consulta en un
editor de texto rico, puede dictarla por voz, la firma, y no puede alterarla después. Con
aislamiento estricto entre especialidades y acceso del paciente a su propia historia.

## Por qué

Lo que hoy se llama "ficha médica" ([`medical-records.functions.ts`](../src/lib/api/medical-records.functions.ts))
es un **archivo subido**: `fileName`, `storagePath`, `fileSize`, `recordVersion`. No hay contenido
clínico estructurado, no se puede buscar, no se puede escribir desde el sistema, y el médico
tiene que redactar el documento afuera y subirlo. El cliente pide poder escribir adentro.

Además hay tres problemas de fondo que este plan resuelve:

1. **No hay aislamiento por especialidad.** [`medicalRecords`](../src/db/schema.ts) no tiene
   `specialtyId`. Hoy la única barrera es `doctorId`, así que el modelo no distingue entre
   "otro médico de mi especialidad" y "un médico de otra especialidad". Un oftalmólogo no debe
   enterarse de una ITS registrada por infectología.
2. **No hay inmutabilidad.** Se puede borrar una ficha (`deleteMedicalRecord`) y subir una versión
   nueva sin rastro de quién ni cuándo. Una historia clínica alterable no sirve como prueba
   (Ley 26.529, arts. 15 y 18: los asientos llevan fecha y firma, y la historia es inviolable).
3. **El paciente no accede a su historia**, siendo que la ley se la reconoce como derecho
   (Ley 26.529, art. 14).

## Decisiones de producto (confirmadas con el cliente)

| #   | Decisión                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Timeline único por paciente**, no uno por doctor. Cada nota tiene autor, fecha y firma                                                                                          |
| D2  | **Aislamiento estricto por especialidad.** Sin _break the glass_. Un médico ve las notas de su(s) especialidad(es), sin importar quién las escribió                               |
| D3  | **Descubrimiento cross-especialidad**: se ve la especialidad y el **nombre** del profesional, nunca el contenido. La clínica es chica; se consulta en persona                     |
| D4  | **Pedido de acceso por el sistema**, con motivo obligatorio, aprobación del autor y vencimiento                                                                                   |
| D5  | **Inmutabilidad**: `borrador` (editable) → `firmada` (bloqueada). Correcciones solo como _addenda_                                                                                |
| D6  | **Los archivos se quedan.** `medicalRecords` se renombra a **"Archivos"** en la UI y acepta imágenes además de PDF                                                                |
| D7  | **El paciente ve su historia completa**, agrupada por especialidad, solo notas firmadas                                                                                           |
| D8  | **Liberación controlada**: al firmar, el médico elige `visible` o `entregar en consulta`. La segunda queda oculta al paciente hasta que el médico la libera                       |
| D9  | Los **archivos siguen la misma regla de visibilidad** que las notas                                                                                                               |
| D10 | **Aviso permanente al médico** en el editor de que el paciente podrá leer la nota                                                                                                 |
| D11 | **Dictado por voz** con Web Speech API, siempre hacia el borrador, nunca auto-firma                                                                                               |
| D12 | **Bloqueo de agenda** por el médico para pacientes extraparticulares. Sin paciente cargado no hay ficha                                                                           |
| D13 | **Centro de notificaciones** persistente en el dashboard del médico                                                                                                               |
| D14 | **Diseño responsive diferenciado** escritorio/móvil, con foco en accesibilidad                                                                                                    |
| D15 | **El admin puede leer notas clínicas** desde su sección de médicos, con motivo obligatorio, auditado y con notificación al autor. Sin aprobación previa: el admin es la autoridad |
| D16 | **El admin sucede o libera las notas** de un médico que deja la clínica                                                                                                           |
| D17 | **Vencimiento de permisos: 30 días**                                                                                                                                              |
| D18 | **Retención**: nada se borra nunca. Ver §12                                                                                                                                       |
| D19 | La **descarga de la historia completa por el paciente queda fuera de alcance** en esta versión                                                                                    |

## Archivos afectados

- [`src/db/schema.ts`](../src/db/schema.ts) — 5 tablas nuevas + 1 columna nullable en `medicalRecords`.
- `src/lib/api/clinical-notes.functions.ts` — **nuevo**.
- `src/lib/api/record-access.functions.ts` — **nuevo**.
- `src/lib/api/notifications.functions.ts` — **nuevo**.
- `src/lib/api/time-blocks.functions.ts` — **nuevo**.
- `src/lib/clinical-permissions.ts` — **nuevo**, función pura del predicado de lectura (testeable).
- [`src/lib/api/medical-records.functions.ts`](../src/lib/api/medical-records.functions.ts) — filtrar por especialidad, aceptar imágenes, visibilidad del paciente.
- [`src/lib/slots.ts`](../src/lib/slots.ts) — **sin cambios de lógica**; los bloques se suman a `occupied` en los llamadores.
- [`src/routes/doctor.tsx`](../src/routes/doctor.tsx) (1474 líneas) — se desarma en `src/components/doctor/*`.
- [`src/routes/dashboard.tsx`](../src/routes/dashboard.tsx) — nueva sección de historia clínica del paciente.
- [`src/routes/staff.tsx`](../src/routes/staff.tsx) — `occupied` debe contemplar bloqueos.
- [`src/routes/admin.tsx`](../src/routes/admin.tsx) — acceso a fichas (§4ter) y sucesión (§4bis),
  extraídos a `src/components/admin/`.
- [`src/lib/pdf-generate.ts`](../src/lib/pdf-generate.ts) — reutilizar para exportar notas.

## Diseño de la solución

### 1. Modelo de datos

Cinco tablas nuevas. `medicalRecords` solo recibe una columna nullable.

#### `clinical_notes` — la sesión

```ts
export const clinicalNotes = pgTable("clinical_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: text("patient_id")
    .notNull()
    .references(() => user.id),
  doctorId: uuid("doctor_id")
    .notNull()
    .references(() => doctors.id),
  specialtyId: uuid("specialty_id")
    .notNull()
    .references(() => specialties.id),
  appointmentId: uuid("appointment_id").references(() => appointments.id),
  sessionDate: timestamp("session_date").notNull(),
  status: text("status", { enum: ["borrador", "firmada"] })
    .notNull()
    .default("borrador"),
  // cabecera estructurada
  motivo: text("motivo"),
  diagnostico: text("diagnostico"),
  proximoControl: timestamp("proximo_control"),
  // cuerpo
  bodyHtml: text("body_html"),
  bodyText: text("body_text"),
  // firma y visibilidad
  signedAt: timestamp("signed_at"),
  signedByUserId: text("signed_by_user_id").references(() => user.id),
  patientVisibility: text("patient_visibility", {
    enum: ["visible", "en_consulta"],
  })
    .notNull()
    .default("visible"),
  releasedToPatientAt: timestamp("released_to_patient_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

**Por qué la cabecera está separada del cuerpo.** Texto 100 % libre se escribe rápido pero después
no se puede filtrar, buscar ni reportar. `motivo`/`diagnostico`/`proximoControl` dan consulta y
estadística; `bodyHtml` da la comodidad de escritura que pide el cliente. Los dos conviven.

**Por qué `bodyText` además de `bodyHtml`.** Buscar dentro de HTML es inviable. `bodyText` es el
espejo en texto plano, se deriva al guardar y lleva índice GIN full-text (`spanish`).

**`specialtyId` se copia del turno al crear la nota** y no se recalcula después. Si el médico
suma una especialidad más adelante, las notas viejas no deben cambiar de compartimento.

Índices: `(patientId, specialtyId, sessionDate desc)`, `(doctorId, status)` y `(appointmentId)`.

**Una nota por turno**, regla que se aplica en la server fn (si ya existe nota para ese
`appointmentId`, se abre en vez de crear otra). Deliberadamente **no** se usa un índice único: si
en el futuro aparece un caso legítimo de dos asientos sobre un mismo turno, un constraint en la DB
obligaría a una migración durante el congelamiento de datos.

#### `clinical_note_addenda` — correcciones post-firma

```ts
export const clinicalNoteAddenda = pgTable("clinical_note_addenda", {
  id: uuid("id").primaryKey().defaultRandom(),
  noteId: uuid("note_id")
    .notNull()
    .references(() => clinicalNotes.id),
  authorDoctorId: uuid("author_doctor_id")
    .notNull()
    .references(() => doctors.id),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

Una nota firmada nunca se sobrescribe ni se borra. Un error se corrige agregando un addendum con
su propia fecha y autor. Es el equivalente digital de tachar sin borrar.

#### `record_access_requests` — pedidos cross-especialidad

```ts
export const recordAccessRequests = pgTable("record_access_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requesterDoctorId: uuid("requester_doctor_id")
    .notNull()
    .references(() => doctors.id),
  targetDoctorId: uuid("target_doctor_id")
    .notNull()
    .references(() => doctors.id),
  patientId: text("patient_id")
    .notNull()
    .references(() => user.id),
  specialtyId: uuid("specialty_id")
    .notNull()
    .references(() => specialties.id),
  reason: text("reason").notNull(),
  status: text("status", {
    enum: ["pendiente", "aprobado", "rechazado", "revocado", "vencido"],
  })
    .notNull()
    .default("pendiente"),
  expiresAt: timestamp("expires_at"),
  decidedAt: timestamp("decided_at"),
  decidedByUserId: text("decided_by_user_id").references(() => user.id),
  createdAt: timestamp("created_at").defaultNow(),
});
```

`reason` es `notNull` a propósito: es lo que hace auditable el pedido y lo que desalienta pedir
por curiosidad.

El permiso es sobre la tupla **`(patientId, specialtyId, targetDoctorId)`**: da lectura de las
notas de _ese_ paciente, en _esa_ especialidad, escritas por _ese_ profesional, hasta `expiresAt`
(default: 30 días). Nunca da escritura. Si el paciente se atendió con dos psicólogos distintos,
hacen falta dos pedidos — a propósito: cada autor decide sobre lo que escribió.

`vencido` no se recalcula por cron: se evalúa al leer, comparando `expiresAt` contra `now()`. Un
job nocturno opcional puede normalizar el campo, pero la lectura no depende de él.

#### `clinical_access_log` — auditoría append-only

```ts
export const clinicalAccessLog = pgTable("clinical_access_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: text("actor_user_id"),
  patientId: text("patient_id"),
  noteId: uuid("note_id"),
  recordId: uuid("record_id"),
  action: text("action", {
    enum: [
      "ver",
      "imprimir",
      "firmar",
      "addendum",
      "solicitar",
      "aprobar",
      "rechazar",
      "revocar",
      "liberar",
      "ver_admin",
      "suceder",
    ],
  }).notNull(),
  viaRequestId: uuid("via_request_id"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

`reason` se usa en las acciones del admin (`ver_admin`, `suceder`), donde no hay un
`record_access_requests` que guarde el motivo.

**Sin foreign keys, a propósito** — mismo criterio que ya usa [`whatsappLog`](../src/db/schema.ts):
el log tiene que sobrevivir al borrado de cualquier fila referenciada, y así el cambio de schema es
puramente aditivo. Nunca se hace `UPDATE` ni `DELETE` sobre esta tabla.

Registrar `imprimir` importa: cuando el papel sale del sistema, al menos queda quién lo sacó.

#### `doctor_time_blocks` — bloqueos de agenda

```ts
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

#### Cambio en `doctors` — sucesión (D16)

```ts
successorDoctorId: uuid("successor_doctor_id"),
```

Nullable, **sin foreign key** para evitar un ciclo de auto-referencia en Drizzle. El admin lo setea
al desactivar a un médico. Ver §4bis.

#### Cambio en `medicalRecords`

Una sola columna, nullable:

```ts
specialtyId: uuid("specialty_id").references(() => specialties.id),
patientVisible: boolean("patient_visible").default(true),
```

Para las filas existentes (`specialtyId is null`) la especialidad se **resuelve en lectura** desde
`doctors.specialtyId` del médico que subió el archivo. No se hace backfill ni `UPDATE` — nada toca
datos existentes, respetando el congelamiento de §4.7.

### 2. Predicado de permisos

Vive en `src/lib/clinical-permissions.ts` como **función pura**, sin acceso a DB, para poder
testearla exhaustivamente con vitest (patrón de [`slots.ts`](../src/lib/slots.ts) / Plan 06).

```ts
export type ClinicalActor =
  | { kind: "doctor"; doctorId: string; specialtyIds: string[] }
  | { kind: "patient"; userId: string }
  | { kind: "staff" }
  | { kind: "admin" };

export function canReadNote(
  actor: ClinicalActor,
  note: NoteRef,
  grants: Grant[],
  now: Date,
): boolean;
export function canWriteNote(actor: ClinicalActor, note: NoteRef): boolean;
export function canSignNote(actor: ClinicalActor, note: NoteRef): boolean;
```

Reglas:

| Actor     | Puede leer                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Doctor    | `note.doctorId === actor.doctorId` **o** `note.specialtyId ∈ actor.specialtyIds` **o** existe un grant aprobado y vigente para `(patientId, specialtyId, targetDoctorId)` |
| Paciente  | `note.patientId === actor.userId` **y** `note.status === "firmada"` **y** (`patientVisibility === "visible"` **o** `releasedToPatientAt != null`)                         |
| Recepción | Nada. Ve turnos, no contenido clínico                                                                                                                                     |
| Admin     | Todo, **solo** por la vía explícita de §4ter: motivo obligatorio, auditado y notificado al autor. Nunca de forma pasiva ni en listados                                    |

| Actor  | Puede escribir                   | Puede firmar                      |
| ------ | -------------------------------- | --------------------------------- |
| Doctor | Solo notas propias en `borrador` | Solo el autor, solo notas propias |
| Resto  | No                               | No                                |

**El predicado se aplica siempre en el servidor**, dentro de las server fns. El cliente puede
ocultar botones, pero eso no es un control de acceso. Alineado con el criterio del Plan 01.

### 3. Descubrimiento cross-especialidad

Para el paciente P y el doctor D, el sistema lista las especialidades en las que P tuvo turnos y
que **no** están en `specialtyIds(D)`, con el nombre del profesional de cada una:

```
Otras especialidades con registros de este paciente
  Psicología    — Lic. María Gómez        [Pedir acceso]
  Cardiología   — Dr. Juan Pérez          [Pedir acceso]
```

Sin conteo de notas, sin fechas, sin diagnósticos. Solo especialidad + nombre. Alcanza para ir a
hablarle en persona (D3) o para pedir por el sistema (D4).

**El conteo se omite deliberadamente.** "17 sesiones de psiquiatría" ya filtra información
clínica sin haber abierto nada.

### 4. Flujo de pedido de acceso

```
D toca "Pedir acceso"
  → escribe motivo (obligatorio)
  → se crea record_access_requests (pendiente) + notificación al doctor destino
  → el destino aprueba o rechaza desde su centro de notificaciones
  → si aprueba: expiresAt = now + 30d, D pasa a leer esas notas
  → cada lectura queda en clinical_access_log con viaRequestId
  → el destino puede revocar en cualquier momento
```

El autor puede revocar sin dar explicaciones. Un permiso vencido o revocado corta la lectura en la
siguiente request; no hace falta invalidar sesión.

### 4bis. Sucesión cuando un médico deja la clínica (D16)

Las notas de un médico que se va **no se transfieren ni se reasignan**: la autoría es un hecho
histórico y cambiarla falsearía la historia clínica. Lo que se transfiere es únicamente la
**potestad de aprobar pedidos de acceso** sobre ellas.

Al desactivar un médico (`doctors.isActive = false`) desde el panel de admin, se pide un sucesor:

- **Con sucesor** (`successorDoctorId`): los pedidos dirigidos al médico inactivo se enrutan al
  sucesor, que aprueba o rechaza como si fueran propios. El sucesor debe compartir al menos una
  especialidad con el saliente; el validador lo verifica.
- **Sin sucesor**: los pedidos quedan dirigidos al **admin**, que los resuelve desde su bandeja.

En ambos casos la resolución se registra en `clinical_access_log` con `action = "suceder"` y el
`decidedByUserId` real, para que quede claro que no la aprobó el autor.

Las notas en `borrador` de un médico saliente quedan huérfanas: nadie más puede firmarlas (solo el
autor firma, D5). El admin puede **liberarlas al paciente** en el estado en que están, marcándolas
con una leyenda de que quedaron sin firmar. No se pueden completar ni editar.

### 4ter. Acceso del admin (D15)

Vive en la sección de médicos del panel de admin, no en una vista global de pacientes. El admin
entra por un médico, ve sus pacientes y desde ahí puede abrir una nota.

```
Admin → Médicos → Dr. X → Pacientes → [Ver ficha]
  → diálogo con motivo obligatorio (mín. 15 caracteres)
  → se abre la nota en modo lectura
  → clinical_access_log: action="ver_admin", reason=<motivo>
  → notificación inmediata al autor: "El administrador accedió a tu ficha de <paciente>. Motivo: …"
```

**Sin aprobación previa.** El admin es la autoridad del sistema y necesita poder resolver una
disputa o recuperar una nota mal cargada sin depender de que alguien conteste. El control no es
preventivo sino **posterior**: el autor se entera siempre y queda el registro.

Tres límites que hacen que esto no degenere en acceso libre:

1. El acceso es **por nota**, no por paciente ni masivo. Cada apertura pide motivo de nuevo.
2. El admin **no puede escribir, firmar, editar ni agregar addenda**. Solo lectura y liberación.
3. Las notas no aparecen en ningún listado, búsqueda ni export del admin. Hay que entrar por el
   camino explícito.

El rol `admin` es de la clínica, no de Mirage. La cuenta semilla `admin@medicare.com` tiene
`mustChangePassword: true`, así que la contraseña por defecto no habilita esto en producción.

### 5. Notificaciones

La tabla [`notifications`](../src/db/schema.ts) **existe en el schema pero no se usa en ningún
lado** — cero inserts, cero lecturas, cero UI. Es scaffolding muerto. Se construye de cero sobre
ella (no hace falta tabla nueva, sí una columna).

Columna adicional, nullable:

```ts
accessRequestId: uuid("access_request_id").references(() => recordAccessRequests.id),
```

UI: campana en el header del `DashboardLayout` con badge de no leídas, panel desplegable con las
últimas 10, y vista completa paginada. Presente en todas las pantallas del médico (D13).

Eventos que generan notificación: pedido de acceso recibido, pedido resuelto (aprobado/rechazado),
permiso revocado, turno nuevo asignado, turno cancelado por el paciente.

**Refresco por polling cada 60 s** con TanStack Query (`refetchInterval`), pausado cuando la
pestaña está oculta — ya existe [`useTabVisible.ts`](../src/lib/useTabVisible.ts). No se usan
WebSockets: el plan Starter de Render duerme el proceso y una conexión persistente no aporta acá.

### 6. Editor

**Tiptap** (`@tiptap/react` + `@tiptap/starter-kit`), no TinyMCE.

| Criterio | Tiptap                                                               | TinyMCE                                                                                |
| -------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Licencia | MIT                                                                  | Dual: GPL v2 o comercial — incompatible con entregar software propietario a un cliente |
| React    | Integración nativa                                                   | Wrapper                                                                                |
| Toolbar  | _Headless_: se arma a mano → escritorio y móvil pueden diferir (D14) | Toolbar propia, pensada para escritorio                                                |
| Peso     | Modular, se importan solo las extensiones usadas                     | Monolítico                                                                             |

Extensiones mínimas: bold, italic, underline, listas, encabezados H3/H4, deshacer/rehacer. Nada de
tablas, imágenes embebidas ni colores — no aportan a una nota clínica y complican el PDF.

**Sanitización obligatoria en el servidor** al guardar (`sanitize-html`, allowlist cerrada de tags
y atributos, sin `style` ni `class`). HTML de usuario guardado y después renderizado al paciente
es XSS directo; la sanitización del cliente no cuenta porque la server fn se puede llamar sola.

`bodyText` se deriva del HTML ya sanitizado, en el mismo paso.

**Plantillas y frases frecuentes por especialidad**: botones grandes que insertan texto en el
cursor ("Paciente refiere…", "Se indica…", "Control en…"). Esto reduce el tecleo mucho más que
cualquier toolbar y es la parte que de verdad hace cómodo el uso táctil.

**Aviso de visibilidad (D10)**: banda fija arriba del cuerpo del editor, no un modal descartable.
Un modal se cierra con el pulgar sin leerlo a partir de la segunda vez.

**Autoguardado** del borrador cada 10 s con _debounce_, más guardado al perder foco.

### 7. Dictado por voz

Web Speech API (`window.SpeechRecognition`), `lang="es-AR"`, `continuous=true`,
`interimResults=true`. El texto interino se muestra en gris y solo se inserta en el documento
cuando el resultado es final.

**Limitaciones que hay que informarle al cliente:**

- **El audio no se procesa localmente.** Chrome lo envía a servidores de Google. Si el cliente
  requiere que los datos no salgan de la clínica, esta opción no cumple.
- **Solo Chrome y Edge.** Firefox no la implementa; Safari/iOS es parcial e inestable.
- Requiere HTTPS (ya está en Render) y permiso de micrófono.
- El vocabulario médico va a fallar con frecuencia y la puntuación en español es pobre.
- El reconocimiento continuo se corta solo tras ~60 s de silencio: hay que reiniciarlo desde el
  handler de `onend` mientras el usuario no haya frenado.

**Mitigación de diseño**: el dictado escribe **siempre en el borrador** y nunca dispara la firma
(D11). El médico dicta, lee, corrige y recién ahí firma. Indicador de grabación visible y botón de
corte siempre accesible.

**Aislamiento**: toda la integración vive en `src/hooks/useDictation.ts` con una interfaz genérica
(`start`, `stop`, `onTranscript`, `isSupported`). Cambiar a Whisper self-hosted después no toca la
UI. Si `isSupported` es `false`, el botón no se muestra — sin mensajes de error al médico.

### 8. Bloqueo de agenda y alta rápida

[`generateSlots`](../src/lib/slots.ts) ya recibe `occupied: OccupiedRange[]`. **Su lógica no se
toca**: los bloques se convierten a rangos y se concatenan al array en los tres llamadores
([`dashboard.tsx:257`](../src/routes/dashboard.tsx), [`doctor.tsx:1253`](../src/routes/doctor.tsx),
[`staff.tsx:407`](../src/routes/staff.tsx)).

Flujo (D12):

```
Médico toca un slot libre → "Bloquear"        → doctor_time_blocks, el slot deja de ofrecerse
Sobre un bloque → "Agregar paciente"          → alta rápida (nombre, apellido, DNI, teléfono)
                                              → se crea user + patients
                                              → el bloque se PROMUEVE a appointment
                                                 (status completado) y se elimina
                                              → desde ahí la ficha funciona como cualquier otra
Sin paciente cargado                          → no hay ficha, solo el horario ocupado
```

**Por qué promover a `appointment` en vez de colgar la nota del bloque.** Un `appointment` real
reutiliza todo lo que ya existe — historial, turnero, `specialtyId`, permisos — sin ninguna rama
especial en el código clínico. `clinical_notes.appointmentId` queda siempre poblado y el modelo no
tiene dos caminos.

**Detalle del alta rápida**: `user.email` es `notNull unique`. Se genera derivado del DNI
(`dni-<documento>@caif.local`) y el usuario se marca `mustChangePassword: true` + `isActive: false`
hasta que reclame la cuenta. Esto **no toca el login de pacientes**, que según las restricciones
globales no hay que endurecer: es un alta administrativa, no un flujo de registro.

La promoción corre en **una transacción** (crear user + patient + appointment + borrar bloque).

### 9. Vista del paciente

`dashboard.tsx` hoy es una página plana de cards sin tabs. Se reestructura en tabs:
**Mis turnos** | **Mi historia clínica** | **Mi perfil**.

Historia clínica: acordeón por especialidad, dentro de cada una las notas en orden cronológico
inverso. Solo notas firmadas y liberadas (D7, D8). Addenda visibles debajo de su nota original.
Archivos con `patientVisible = true` en la misma vista (D9). Descarga en PDF de cada nota.

### 10. Responsive y accesibilidad (D14)

|            | Escritorio (≥ lg)                         | Móvil                                   |
| ---------- | ----------------------------------------- | --------------------------------------- |
| Layout     | 3 columnas: pacientes / timeline / editor | Una vista por vez, navegación en stack  |
| Toolbar    | Completa, siempre visible                 | Reducida (bold, lista, dictado) + "más" |
| Plantillas | Panel lateral                             | Hoja inferior deslizable                |

Se respetan las convenciones ya documentadas en [`CLAUDE.md`](../CLAUDE.md): targets táctiles de
44 px, tabs con scroll horizontal e íconos, tablas que pasan a cards en `md`.

Accesibilidad: el editor necesita `aria-label` y `role="textbox"`, foco visible en toda la toolbar,
navegación completa por teclado, y el estado de dictado anunciado por `aria-live="polite"`.
Contraste AA en los estados de nota (borrador/firmada), sin depender solo del color.

### 11. Refactor de `doctor.tsx`

1474 líneas hoy. Agregar el módulo clínico adentro lo llevaría a más de 2500, que es inmanejable
tanto para una persona como para una herramienta. Se desarma antes de empezar, **sin cambios
funcionales**.

Estructura final (la Fase 0 crea solo los tabs existentes; `clinical/` aparece en la Fase 2):

```
src/components/doctor/
  AgendaTab.tsx
  HorariosTab.tsx
  ObrasSocialesTab.tsx
  ArchivosTab.tsx        (era MedicalRecordsTab)
  DescripcionTab.tsx
  PerfilTab.tsx
  clinical/
    HistoriaClinicaTab.tsx
    PatientList.tsx
    NoteTimeline.tsx
    NoteEditor.tsx
    NoteViewer.tsx
    SignDialog.tsx
    OtherSpecialtiesPanel.tsx
```

Esto adelanta parte del Plan 07 sobre este archivo. Ver §"Solapamientos".

`admin.tsx` (1281 líneas) recibe dos pantallas nuevas (acceso a fichas y sucesión). Se extraen a
`src/components/admin/` siguiendo el patrón que ya existe con `GalleryTab.tsx` y `WhatsAppTab.tsx`,
sin desarmar el resto del archivo.

### 12. Retención y borrado (D18)

**Nada del módulo clínico se borra nunca.** No hay `DELETE` en ninguna server fn de
`clinical_notes`, `clinical_note_addenda`, `record_access_requests` ni `clinical_access_log`.

Base legal: la Ley 26.529 (art. 18) obliga a los establecimientos a conservar la historia clínica
por un plazo **mínimo de 10 años**. Como el sistema no borra, se cumple por construcción; esto se
documenta acá para que la decisión sea explícita y no un accidente.

Consecuencias operativas a tener presentes:

- **Un médico dado de baja no se elimina**, se marca `isActive = false`. Un `DELETE` sobre
  `doctors` cascadearía a `clinical_notes` por la FK y destruiría historia clínica. El panel de
  admin no debe ofrecer borrado de médicos con notas asociadas.
- Lo mismo aplica a `user` con rol `paciente`: `patients` y las notas cuelgan de ahí por FK.
- Una nota en `borrador` **sí** se puede descartar mientras nunca haya sido firmada. Un borrador no
  es un asiento de la historia clínica; es texto en curso. Una vez firmada, nunca más.
- El único crecimiento no acotado es `clinical_access_log`. Son filas chicas (sin blobs) y el
  volumen de una clínica de este tamaño es despreciable frente a los 256 MB de Postgres. Si algún
  día molesta, se archiva — no se borra.

**Fuera de alcance (D19)**: la descarga de la historia clínica completa por parte del paciente. La
Ley 26.529 (art. 14) se la reconoce como derecho, así que conviene planificarla para una versión
posterior. Mientras tanto la clínica puede satisfacer un pedido formal exportando nota por nota
desde el panel del médico o del admin.

## Pasos de implementación

### Fase 0 — Refactor de `doctor.tsx`

1. Extraer cada tab a `src/components/doctor/*`, sin tocar comportamiento.
2. Renombrar `MedicalRecordsTab` → `ArchivosTab` y su etiqueta a "Archivos" (D6).
3. Verificar que `bun test` y `bunx tsc --noEmit` siguen limpios.

### Fase 1 — Bloqueo de agenda + alta rápida

4. Tabla `doctor_time_blocks`.
5. `time-blocks.functions.ts`: crear, listar por rango, borrar.
6. Sumar bloques a `occupied` en los tres llamadores de `generateSlots`.
7. UI de bloqueo en la agenda del médico.
8. Alta rápida de paciente + promoción del bloque a `appointment`, en transacción.
9. Tests de `generateSlots` con bloques solapando turnos y bordes de bloque.

### Fase 2 — Núcleo clínico

10. Tablas `clinical_notes` y `clinical_note_addenda` + columnas `specialtyId`/`patientVisible` en `medicalRecords`.
11. `src/lib/clinical-permissions.ts` (función pura) + su suite de tests. **Antes que la UI.**
12. `clinical-notes.functions.ts`: crear borrador desde turno, autoguardar, firmar, addendum, listar timeline, buscar.
13. Sanitización server-side + derivación de `bodyText` + índice GIN.
14. UI: lista de pacientes, timeline, editor Tiptap, plantillas, diálogo de firma con opción de visibilidad (D8).
15. Aplicar el filtro por especialidad también a `medical-records.functions.ts` (resolviendo `specialtyId` null desde el doctor).

### Fase 3 — Notificaciones + acceso cross-especialidad

16. Tablas `record_access_requests` y `clinical_access_log`, **antes** que la columna
    `accessRequestId` de `notifications`, que las referencia por FK.
17. `notifications.functions.ts` + campana y panel en `DashboardLayout`.
18. `record-access.functions.ts`: solicitar, aprobar, rechazar, revocar, listar vigentes.
19. Panel "Otras especialidades" con nombres (D3) y botón de pedido.
20. Enganchar el predicado de permisos con los grants vigentes.
21. Escribir en el log de auditoría en cada lectura, impresión, firma y decisión.
22. **Acceso del admin (§4ter)**: columna `reason` en el log, pantalla en la sección de médicos del
    panel de admin, diálogo de motivo obligatorio y notificación al autor.
23. **Sucesión (§4bis)**: columna `successorDoctorId` en `doctors`, selección de sucesor al
    desactivar un médico, enrutamiento de pedidos al sucesor o al admin, y bandeja del admin.

### Fase 4 — Vista del paciente

24. Reestructurar `dashboard.tsx` en tabs.
25. Historia clínica agrupada por especialidad, solo firmadas y liberadas.
26. Acción "Liberar al paciente" para notas marcadas `en_consulta`.

### Fase 5 — Dictado por voz

27. `useDictation.ts` con interfaz agnóstica del proveedor.
28. Integración en el editor: interino en gris, final insertado, indicador de grabación.
29. Detección de soporte con degradación silenciosa.

### Fase 6 — Exportación y pulido

30. PDF por nota reutilizando `pdf-generate.ts`, con pie de firma y addenda.
31. Registro de `imprimir` en la auditoría.
32. Pasada de responsive y accesibilidad sobre todas las pantallas nuevas.

## Consideraciones de despliegue

- **Todo el schema es aditivo**: tablas nuevas y columnas nullable. Es seguro bajo el
  `drizzle-kit push` automático del `Dockerfile` y compatible con la fase de carga de médicos.
- **Ninguna migración de datos.** El `specialtyId` null de las filas viejas de `medicalRecords` se
  resuelve en lectura, no con `UPDATE`.
- Cada fase es un deploy independiente en la **ventana 21:00–08:00 ARG**.
- **Verificar `bun db:push` local contra una copia** antes de cada fase que toque `schema.ts`
  (fases 1, 2 y 3).
- **Espacio en disco**: `bodyHtml` es texto, no base64 — el impacto en los 256 MB de Postgres es
  marginal comparado con los archivos actuales. Nada que ver con el problema M9 del Plan 08.
- **Dependencias nuevas**: `@tiptap/react`, `@tiptap/starter-kit`, `sanitize-html`. Ojo con el
  `minimumReleaseAge = 86400` de `bunfig.toml`.

## Criterios de aceptación

**Aislamiento**

- Un oftalmólogo con turno con P **no** ve las notas ni los archivos de psiquiatría de P.
- Sí ve que existe "Psiquiatría — Dr. X", sin conteo ni contenido.
- Dos médicos de la misma especialidad ven las notas del otro sobre el mismo paciente.
- Llamar la server fn de lectura a mano con un `noteId` ajeno devuelve `FORBIDDEN`.

**Inmutabilidad**

- Una nota firmada no se puede editar ni borrar por ninguna vía, incluida la server fn directa.
- Una corrección genera un addendum con autor y fecha propios; la nota original queda intacta.

**Paciente**

- El paciente ve sus notas firmadas agrupadas por especialidad, y ninguna en borrador.
- Una nota firmada como `en_consulta` no le aparece hasta que el médico la libera.

**Acceso cross-especialidad**

- Un pedido sin motivo es rechazado por el validador.
- Aprobado, el solicitante lee; revocado, deja de leer en la siguiente request.
- Cada lectura vía permiso queda en `clinical_access_log` con `viaRequestId`.

**Admin y sucesión**

- El admin no ve ninguna nota en listados, búsquedas ni exports; solo por el camino explícito.
- Abrir una nota como admin sin motivo (o con menos de 15 caracteres) es rechazado.
- Al abrirla, el autor recibe la notificación con el motivo y queda `ver_admin` en el log.
- El admin no puede editar, firmar ni agregar addenda por ninguna vía.
- Con un médico inactivo y sucesor asignado, un pedido dirigido a él le llega al sucesor.
- Sin sucesor, el pedido le llega al admin.
- Intentar borrar un médico con notas asociadas no está disponible en el panel.

**Agenda**

- Un slot bloqueado no se ofrece a pacientes ni a recepción.
- Al agregar paciente sobre un bloque, se crea el turno y el bloque desaparece.
- Un bloque sin paciente no permite crear ficha.

**Voz**

- El dictado inserta en el borrador y nunca cambia el estado a firmada.
- En un navegador sin soporte, el botón no aparece y el editor funciona igual.

**Transversal**

- `bun test`, `bunx tsc --noEmit` y `bun lint` limpios.
- Guardar `<script>alert(1)</script>` en el cuerpo y verificar que se sanitiza en el servidor.

## Riesgos y rollback

| Riesgo                                                                    | Nivel    | Mitigación                                                                                         |
| ------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| El predicado de permisos tiene un agujero y se filtra info clínica        | **Alto** | Función pura con tests exhaustivos antes de la UI (paso 11). Chequeo siempre server-side           |
| XSS por HTML del editor                                                   | Alto     | Sanitización server-side con allowlist cerrada, más test dedicado                                  |
| Web Speech API inutilizable en la práctica                                | Medio    | Es la última fase. Aislada en un hook; todo lo demás funciona sin ella                             |
| El refactor de `doctor.tsx` rompe algo                                    | Medio    | Fase 0 aparte, sin cambios funcionales, con CI verde antes de seguir                               |
| La promoción de bloque a turno deja datos a medias                        | Medio    | Transacción única                                                                                  |
| Los médicos siguen usando archivos y no escriben notas                    | Medio    | Es adopción, no técnico. Los archivos se quedan a propósito (D6); la migración es gradual          |
| El acceso del admin se usa de rutina y erosiona el aislamiento            | Medio    | Motivo por nota, notificación al autor y auditoría. El control es posterior, no preventivo (§4ter) |
| Un `DELETE` sobre `doctors` o `user` cascadea y destruye historia clínica | **Alto** | Baja lógica con `isActive`, nunca `DELETE`. El panel no ofrece borrado con notas asociadas (§12)   |

**Rollback**: como el schema es puramente aditivo y no se migran datos, revertir el código deja el
sistema exactamente como estaba. Las tablas nuevas quedan huérfanas sin afectar nada.

## Qué NO tocar

- **`medicalRecords.fileData` / `storagePath`** y toda la lógica del Plan 08. Acá solo se agregan
  dos columnas nullable.
- **El login de pacientes.** El alta rápida es administrativa, no un flujo de registro.
- **La lógica interna de `generateSlots`.** Los bloques se suman en los llamadores.
- **El scheduler de WhatsApp** y su turnero.
- **El softlock 21:00–08:00.** Las notas clínicas quedan sujetas a él como todo lo demás.

## Solapamientos con otros planes

- **07 (refactor de componentes)**: la Fase 0 adelanta el desarme de `doctor.tsx`. Si el 07 se hace
  después, ese archivo ya está resuelto.
- **09 (rediseño UX)**: las pantallas nuevas se hacen con el diseño vigente al momento. Si el 09 va
  primero, se alinean con él.
- **08 (storage)**: independiente. Este plan no agrega archivos nuevos ni cambia dónde vive el byte.
- **01 (autorización server-side)**: el predicado de permisos sigue el mismo criterio. Si el 01 ya
  está, se reutilizan `requireDoctor`/`AuthError` de [`_guards.ts`](../src/lib/api/_guards.ts).

## Preguntas abiertas

Ninguna bloqueante. Todas las que había quedaron resueltas en D15–D19 y §4bis, §4ter y §12.

Dos cosas que conviene confirmar con el cliente antes del arranque, pero que no cambian el diseño:

1. **El dictado por voz manda audio a servidores de Google** (§7). Si la clínica requiere que los
   datos de salud no salgan de su infraestructura, hay que reemplazar Web Speech API por Whisper
   self-hosted. El hook `useDictation` está aislado justamente para que ese cambio no toque la UI.
2. **El derecho del paciente a una copia completa** (Ley 26.529, art. 14) queda sin cubrir por
   ahora (D19). Mientras tanto se satisface exportando nota por nota. Conviene que el cliente sepa
   que la obligación existe.
