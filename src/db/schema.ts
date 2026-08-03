import {
  pgTable,
  text,
  uuid,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  role: text("role", {
    enum: ["paciente", "medico", "recepcionista", "admin"],
  })
    .notNull()
    .default("paciente"),
  mustChangePassword: boolean("must_change_password").default(false),
  isActive: boolean("is_active").default(true),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    documentNumber: text("document_number").notNull(),
    birthDate: timestamp("birth_date"),
  },
  (t) => [uniqueIndex("patients_dni_idx").on(t.documentNumber)],
);

export const specialties = pgTable("specialties", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  icon: text("icon"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const doctorSpecialties = pgTable(
  "doctor_specialties",
  {
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "cascade" }),
    specialtyId: uuid("specialty_id")
      .notNull()
      .references(() => specialties.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("doctor_specialty_idx").on(t.doctorId, t.specialtyId)],
);

export const doctors = pgTable("doctors", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  specialtyId: uuid("specialty_id").references(() => specialties.id),
  licenseNumber: text("license_number"),
  bio: text("bio"),
  slotMinutes: integer("slot_minutes").default(30),
  insuranceCompanies: text("insurance_companies").array(),
  isActive: boolean("is_active").default(true),
  whatsappNotifications: boolean("whatsapp_notifications").default(false),
  directBooking: boolean("direct_booking").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  // Plan 10, Fase 3, D16. Nullable y SIN foreign key a proposito (evita un
  // ciclo de auto-referencia en Drizzle). El admin lo setea al desactivar un
  // medico; los pedidos de acceso dirigidos a el se enrutan al sucesor.
  successorDoctorId: uuid("successor_doctor_id"),
});

export const doctorSchedules = pgTable("doctor_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id")
    .notNull()
    .references(() => doctors.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
});

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

export const appointments = pgTable("appointments", {
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
  scheduledAt: timestamp("scheduled_at").notNull(),
  durationMinutes: integer("duration_minutes").default(30),
  status: text("status", {
    enum: ["pendiente", "confirmado", "cancelado", "completado", "ausente"],
  }).default("pendiente"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Plan 08: `fileData` (base64 en Postgres) se reemplaza por `storagePath` (archivo en
// disco, ver src/lib/storage.server.ts). `fileData` queda nullable durante la
// transición para servir filas viejas aún no migradas; se elimina en una migración
// manual posterior, fuera del `drizzle-kit push` automático del deploy.
export const galleryImages = pgTable("gallery_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url"),
  title: text("title"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  imageType: text("image_type").default("url"),
  fileData: text("file_data"),
  storagePath: text("storage_path"),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const medicalRecords = pgTable("medical_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id")
    .notNull()
    .references(() => doctors.id, { onDelete: "cascade" }),
  patientId: text("patient_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull().default("application/pdf"),
  fileData: text("file_data"),
  storagePath: text("storage_path"),
  fileSize: integer("file_size").notNull(),
  recordVersion: integer("record_version").notNull().default(1),
  // Plan 10, Fase 2. Nullable a proposito: las filas viejas no tienen
  // especialidad asignada y se resuelven en lectura desde doctors.specialtyId
  // del medico que subio el archivo (sin backfill, ver docs/10-modulo-clinico.md §1).
  specialtyId: uuid("specialty_id").references(() => specialties.id),
  patientVisible: boolean("patient_visible").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Plan 10, Fase 2. La sesion clinica: un asiento por consulta, con cabecera
// estructurada (motivo/diagnostico/proximoControl) separada del cuerpo libre
// (bodyHtml/bodyText) para que se pueda filtrar y buscar. specialtyId se
// copia del turno al crear la nota y no se recalcula despues (ver §1).
// Inmutable una vez firmada: las correcciones son addenda (clinicalNoteAddenda),
// nunca un UPDATE sobre bodyHtml/bodyText tras `signedAt`.
export const clinicalNotes = pgTable(
  "clinical_notes",
  {
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
    motivo: text("motivo"),
    diagnostico: text("diagnostico"),
    proximoControl: timestamp("proximo_control"),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
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
  },
  (t) => [
    index("clinical_notes_patient_specialty_date_idx").on(
      t.patientId,
      t.specialtyId,
      t.sessionDate,
    ),
    index("clinical_notes_doctor_status_idx").on(t.doctorId, t.status),
    index("clinical_notes_appointment_idx").on(t.appointmentId),
  ],
);

// Plan 10, Fase 2. Correccion post-firma. Una nota firmada nunca se
// sobrescribe: un error se corrige agregando un addendum con su propia
// fecha y autor (equivalente digital de tachar sin borrar).
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

// Plan 10, Fase 3. Pedido de acceso cross-especialidad. El permiso es sobre
// la tupla (patientId, specialtyId, targetDoctorId): da lectura de las notas
// de ESE paciente, en ESA especialidad, escritas por ESE profesional, hasta
// expiresAt (default 30 dias, D17). Nunca da escritura.
// `reason` es notNull a proposito: es lo que hace auditable el pedido.
// `status: "vencido"` no se recalcula por cron, se evalua al leer comparando
// expiresAt contra now() (ver clinical-permissions.ts).
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

// Plan 10, Fase 3. Auditoria append-only del modulo clinico. Sin foreign keys
// a proposito (mismo criterio que whatsappLog): el log tiene que sobrevivir
// al borrado de cualquier fila referenciada, y el schema queda puramente
// aditivo. Nunca se hace UPDATE ni DELETE sobre esta tabla.
// `reason` se usa en las acciones del admin (ver_admin, suceder), donde no
// hay un record_access_requests que guarde el motivo.
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

// Registro de envíos del turnero por WhatsApp (Plan 02, P1). Append-only:
// `doctorId` es un uuid SIN foreign key a propósito, para que el log sobreviva
// a un eventual borrado del médico y para que el cambio de schema sea puramente
// aditivo (una tabla nueva, sin tocar ni referenciar tablas existentes).
export const whatsappLog = pgTable("whatsapp_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id"),
  targetDate: text("target_date").notNull(), // fecha del turnero (YYYY-MM-DD, ARG)
  status: text("status", { enum: ["sent", "failed"] }).notNull(),
  error: text("error"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").default("info"),
  isRead: boolean("is_read").default(false),
  appointmentId: uuid("appointment_id").references(() => appointments.id),
  // Plan 10, Fase 3. Nullable: solo las notificaciones del flujo de acceso
  // cross-especialidad la usan (pedido recibido/resuelto/revocado).
  accessRequestId: uuid("access_request_id").references(() => recordAccessRequests.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const doctorsRelations = relations(doctors, ({ one, many }) => ({
  specialty: one(specialties, { fields: [doctors.specialtyId], references: [specialties.id] }),
  user: one(user, { fields: [doctors.userId], references: [user.id] }),
  specialties: many(doctorSpecialties),
  schedules: many(doctorSchedules),
  medicalRecords: many(medicalRecords),
  timeBlocks: many(doctorTimeBlocks),
}));

export const doctorSpecialtiesRelations = relations(doctorSpecialties, ({ one }) => ({
  doctor: one(doctors, { fields: [doctorSpecialties.doctorId], references: [doctors.id] }),
  specialty: one(specialties, {
    fields: [doctorSpecialties.specialtyId],
    references: [specialties.id],
  }),
}));

export const userRelations = relations(user, ({ many }) => ({
  patients: many(patients),
  doctors: many(doctors),
  notifications: many(notifications),
  medicalRecords: many(medicalRecords),
}));

export const medicalRecordsRelations = relations(medicalRecords, ({ one }) => ({
  doctor: one(doctors, { fields: [medicalRecords.doctorId], references: [doctors.id] }),
  patient: one(user, { fields: [medicalRecords.patientId], references: [user.id] }),
  specialty: one(specialties, {
    fields: [medicalRecords.specialtyId],
    references: [specialties.id],
  }),
}));

export const clinicalNotesRelations = relations(clinicalNotes, ({ one, many }) => ({
  patient: one(user, { fields: [clinicalNotes.patientId], references: [user.id] }),
  doctor: one(doctors, { fields: [clinicalNotes.doctorId], references: [doctors.id] }),
  specialty: one(specialties, {
    fields: [clinicalNotes.specialtyId],
    references: [specialties.id],
  }),
  appointment: one(appointments, {
    fields: [clinicalNotes.appointmentId],
    references: [appointments.id],
  }),
  addenda: many(clinicalNoteAddenda),
}));

export const clinicalNoteAddendaRelations = relations(clinicalNoteAddenda, ({ one }) => ({
  note: one(clinicalNotes, {
    fields: [clinicalNoteAddenda.noteId],
    references: [clinicalNotes.id],
  }),
  author: one(doctors, {
    fields: [clinicalNoteAddenda.authorDoctorId],
    references: [doctors.id],
  }),
}));

export const recordAccessRequestsRelations = relations(recordAccessRequests, ({ one }) => ({
  requester: one(doctors, {
    fields: [recordAccessRequests.requesterDoctorId],
    references: [doctors.id],
    relationName: "recordAccessRequester",
  }),
  target: one(doctors, {
    fields: [recordAccessRequests.targetDoctorId],
    references: [doctors.id],
    relationName: "recordAccessTarget",
  }),
  patient: one(user, { fields: [recordAccessRequests.patientId], references: [user.id] }),
  specialty: one(specialties, {
    fields: [recordAccessRequests.specialtyId],
    references: [specialties.id],
  }),
}));

export const patientsRelations = relations(patients, ({ one }) => ({
  user: one(user, { fields: [patients.userId], references: [user.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  patient: one(user, { fields: [appointments.patientId], references: [user.id] }),
  doctor: one(doctors, { fields: [appointments.doctorId], references: [doctors.id] }),
  specialty: one(specialties, { fields: [appointments.specialtyId], references: [specialties.id] }),
}));

export const doctorSchedulesRelations = relations(doctorSchedules, ({ one }) => ({
  doctor: one(doctors, { fields: [doctorSchedules.doctorId], references: [doctors.id] }),
}));

export const specialtiesRelations = relations(specialties, ({ many }) => ({
  doctors: many(doctorSpecialties),
}));

export const doctorTimeBlocksRelations = relations(doctorTimeBlocks, ({ one }) => ({
  doctor: one(doctors, { fields: [doctorTimeBlocks.doctorId], references: [doctors.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(user, { fields: [notifications.userId], references: [user.id] }),
  accessRequest: one(recordAccessRequests, {
    fields: [notifications.accessRequestId],
    references: [recordAccessRequests.id],
  }),
}));
