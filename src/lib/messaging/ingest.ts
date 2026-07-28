import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activities,
  channelIdentities,
  contacts,
  conversations,
  messages,
} from "@/lib/db/schema";
import type { InboundMessage, StatusUpdate } from "@/lib/channels/types";
import { isOptOut } from "@/lib/channels/policy";

/**
 * Convierte un mensaje entrante normalizado en filas de CRM.
 * Idempotente: Meta reintenta webhooks y no debe duplicar nada.
 */
export async function ingestInbound(msg: InboundMessage): Promise<void> {
  // 1. ¿Ya lo procesamos? (reintento de Meta)
  const dup = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.externalId, msg.externalMessageId))
    .limit(1);
  if (dup.length > 0) return;

  // 2. Identidad de canal → contacto (se crea si es la primera vez)
  const identity = await db
    .select()
    .from(channelIdentities)
    .where(
      and(
        eq(channelIdentities.channel, msg.channel),
        eq(channelIdentities.externalId, msg.externalUserId)
      )
    )
    .limit(1);

  let contactId: number;

  if (identity.length > 0) {
    contactId = identity[0].contactId;
  } else {
    const [contact] = await db
      .insert(contacts)
      .values({
        name: msg.displayName ?? null,
        // En WhatsApp el external id ES el teléfono. En IG/Messenger no hay.
        phone: msg.channel === "whatsapp" ? msg.externalUserId : null,
        source: msg.channel,
      })
      .returning();

    contactId = contact.id;

    await db.insert(channelIdentities).values({
      contactId,
      channel: msg.channel,
      externalId: msg.externalUserId,
      displayName: msg.displayName ?? null,
    });

    await db.insert(activities).values({
      contactId,
      type: "contact_created",
      summary: `Nuevo contacto desde ${msg.channel}`,
    });
  }

  // 3. Conversación (una por contacto+canal)
  const existing = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.channel, msg.channel),
        eq(conversations.externalId, msg.externalUserId)
      )
    )
    .limit(1);

  let conversationId: number;

  if (existing.length > 0) {
    conversationId = existing[0].id;
  } else {
    const [conv] = await db
      .insert(conversations)
      .values({
        contactId,
        channel: msg.channel,
        externalId: msg.externalUserId,
      })
      .returning();
    conversationId = conv.id;
  }

  const preview =
    msg.text?.slice(0, 140) ??
    (msg.type === "text" ? "" : `[${msg.type}]`);

  // 4. Mensaje
  await db.insert(messages).values({
    conversationId,
    direction: "inbound",
    type: msg.type,
    text: msg.text ?? null,
    mediaUrl: msg.mediaUrl ?? null,
    mediaMime: msg.mediaMime ?? null,
    externalId: msg.externalMessageId,
    status: "delivered",
    author: "contact",
    payload: msg.raw,
    createdAt: msg.timestamp,
  });

  // 5. Estado de la conversación. lastInboundAt gobierna la ventana de 24 h.
  await db
    .update(conversations)
    .set({
      lastInboundAt: msg.timestamp,
      lastMessageAt: msg.timestamp,
      lastMessagePreview: preview,
      status: "open",
      unreadCount: sql`${conversations.unreadCount} + 1`,
    })
    .where(eq(conversations.id, conversationId));

  await db.insert(activities).values({
    contactId,
    type: "message_in",
    summary: preview,
    payload: { channel: msg.channel },
  });

  // 6. Anti-ban: baja automática.
  if (isOptOut(msg.text)) {
    await db
      .update(contacts)
      .set({ optedOut: true, optedOutAt: new Date(), updatedAt: new Date() })
      .where(eq(contacts.id, contactId));

    await db.insert(activities).values({
      contactId,
      type: "opted_out",
      summary: "El contacto pidió no recibir más mensajes. Envíos bloqueados.",
    });
  }
}

/** Confirmaciones de entrega/lectura de mensajes que enviamos. */
export async function ingestStatus(update: StatusUpdate): Promise<void> {
  await db
    .update(messages)
    .set({ status: update.status, error: update.error ?? null })
    .where(eq(messages.externalId, update.externalMessageId));
}
