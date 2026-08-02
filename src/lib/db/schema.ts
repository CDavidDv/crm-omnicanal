import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

/** Canales soportados. Todos vía Graph API oficial de Meta. */
export const channelEnum = pgEnum("channel", [
  "whatsapp",
  "messenger",
  "instagram",
]);

export const directionEnum = pgEnum("direction", ["inbound", "outbound"]);

export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "template",
  "unsupported",
]);

export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);

export const conversationStatusEnum = pgEnum("conversation_status", [
  "open",
  "pending",
  "closed",
]);

export const leadStatusEnum = pgEnum("lead_status", ["open", "won", "lost"]);

export const outboxStatusEnum = pgEnum("outbox_status", [
  "queued",
  "sending",
  "sent",
  "failed",
  "blocked",
]);

export const activityTypeEnum = pgEnum("activity_type", [
  "contact_created",
  "message_in",
  "message_out",
  "stage_changed",
  "lead_created",
  "lead_won",
  "lead_lost",
  "note_added",
  "task_created",
  "task_done",
  "opted_out",
]);

// -----------------------------------------------------------------------------
// Contactos e identidades de canal
// -----------------------------------------------------------------------------

/**
 * Persona. Un contacto puede tener varias identidades (mismo humano en WhatsApp
 * e Instagram). NUNCA identificar por teléfono: en IG/Messenger no existe.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    name: text("name"),
    phone: text("phone"),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    company: text("company"),
    location: text("location"),
    notes: text("notes"),
    source: text("source"), // de dónde llegó: anuncio, orgánico, referido...
    ownerEmail: text("owner_email"), // vendedor asignado
    /** Anti-ban: si es true, la policy bloquea todo envío. */
    optedOut: boolean("opted_out").notNull().default(false),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_contacts_phone").on(t.phone)]
);

/** Identidad del contacto en un canal concreto (WA id, PSID, IGSID). */
export const channelIdentities = pgTable(
  "channel_identities",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    /** wa_id (E.164 sin +), PSID de Messenger o IGSID de Instagram. */
    externalId: text("external_id").notNull(),
    displayName: text("display_name"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_identity_channel_external").on(t.channel, t.externalId),
    index("idx_identity_contact").on(t.contactId),
  ]
);

// -----------------------------------------------------------------------------
// Conversaciones y mensajes
// -----------------------------------------------------------------------------

export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    /** Identidad del contacto en ese canal (destinatario al responder). */
    externalId: text("external_id").notNull(),
    status: conversationStatusEnum("status").notNull().default("open"),
    assignedTo: text("assigned_to"),
    /** Clave para la ventana de 24 h. Se actualiza en cada mensaje entrante. */
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_conversation_channel_external").on(t.channel, t.externalId),
    index("idx_conversations_last_message").on(t.lastMessageAt),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: directionEnum("direction").notNull(),
    type: messageTypeEnum("type").notNull().default("text"),
    text: text("text"),
    mediaUrl: text("media_url"),
    mediaMime: text("media_mime"),
    /** ID del mensaje en Meta. Único → idempotencia ante reintentos del webhook. */
    externalId: text("external_id"),
    status: messageStatusEnum("status").notNull().default("sent"),
    error: text("error"),
    /** Quién lo mandó: 'contact' | 'agent:<email>' | 'bot' */
    author: text("author"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_messages_conversation").on(t.conversationId, t.createdAt),
    uniqueIndex("uq_messages_external").on(t.externalId),
  ]
);

// -----------------------------------------------------------------------------
// Pipeline de ventas
// -----------------------------------------------------------------------------

export const stages = pgTable("stages", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  color: text("color").notNull().default("slate"),
  isWon: boolean("is_won").notNull().default(false),
  isLost: boolean("is_lost").notNull().default(false),
});

/** Oportunidad de venta. Un contacto puede tener varias a lo largo del tiempo. */
export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    stageId: integer("stage_id")
      .notNull()
      .references(() => stages.id),
    title: text("title").notNull(),
    /** Enteros en centavos. Nunca float con dinero. */
    valueCents: integer("value_cents").notNull().default(0),
    currency: text("currency").notNull().default("MXN"),
    status: leadStatusEnum("status").notNull().default("open"),
    source: text("source"),
    channel: channelEnum("channel"),
    ownerEmail: text("owner_email"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_leads_stage").on(t.stageId),
    index("idx_leads_contact").on(t.contactId),
    index("idx_leads_status").on(t.status),
  ]
);

// -----------------------------------------------------------------------------
// Seguimiento
// -----------------------------------------------------------------------------

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    leadId: integer("lead_id").references(() => leads.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    ownerEmail: text("owner_email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_tasks_due").on(t.done, t.dueAt)]
);

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").references(() => contacts.id, {
    onDelete: "cascade",
  }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  author: text("author"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Línea de tiempo unificada del contacto. */
export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    leadId: integer("lead_id").references(() => leads.id, {
      onDelete: "cascade",
    }),
    type: activityTypeEnum("type").notNull(),
    summary: text("summary"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_activities_contact").on(t.contactId, t.createdAt)]
);

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("slate"),
});

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("uq_contact_tag").on(t.contactId, t.tagId)]
);

// -----------------------------------------------------------------------------
// Infraestructura de mensajería
// -----------------------------------------------------------------------------

/** Cola de salida. Todo saliente pasa por aquí: da reintentos y rate limit. */
export const outbox = pgTable(
  "outbox",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: integer("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    channel: channelEnum("channel").notNull(),
    externalId: text("external_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_outbox_pending").on(t.status, t.scheduledAt)]
);

/** Bitácora cruda de webhooks. Sirve para depurar y para no perder nada. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: serial("id").primaryKey(),
    channel: channelEnum("channel"),
    signatureOk: boolean("signature_ok").notNull().default(false),
    processed: boolean("processed").notNull().default(false),
    error: text("error"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_webhook_events_created").on(t.createdAt)]
);

/**
 * Respuestas rápidas del equipo. Solo texto que el vendedor inserta y puede
 * editar antes de mandar: no son plantillas de Meta ni sirven fuera de la
 * ventana de 24 h. `channel` en null = disponible en los tres canales.
 */
export const quickReplies = pgTable(
  "quick_replies",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    channel: channelEnum("channel"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_quick_replies_order").on(t.position)]
);

// -----------------------------------------------------------------------------
// Tipos inferidos
// -----------------------------------------------------------------------------

export type Channel = (typeof channelEnum.enumValues)[number];
export type Contact = typeof contacts.$inferSelect;
export type ChannelIdentity = typeof channelIdentities.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Stage = typeof stages.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
export type QuickReply = typeof quickReplies.$inferSelect;
