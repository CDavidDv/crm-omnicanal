import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, contacts, conversations, messages } from "@/lib/db/schema";
import { getAdapter } from "@/lib/channels";
import { canSend, type SendDecision } from "@/lib/channels/policy";
import type { MediaKind } from "@/lib/channels/types";
import { enqueue } from "./outbox";

export interface SendOutboundInput {
  conversationId: number;
  text: string;
  author: string;
  /** Solo WhatsApp y solo fuera de la ventana de 24 h. */
  template?: { name: string; language: string; params?: string[] };
}

export type SendOutboundResult =
  | { ok: true; messageId: number; queued?: boolean }
  | { ok: false; reason: string; needsTemplate?: boolean };

type Conversation = typeof conversations.$inferSelect;

/**
 * Paso previo común a todo envío: cargar la conversación y pasar la policy
 * anti-ban. Ninguna función de este módulo debe saltárselo.
 */
async function authorize(conversationId: number): Promise<
  | { ok: true; conv: Conversation; decision: Extract<SendDecision, { allowed: true }> }
  | { ok: false; reason: string }
> {
  const rows = await db
    .select({
      conv: conversations,
      contact: contacts,
    })
    .from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (rows.length === 0) return { ok: false, reason: "Conversación no encontrada" };

  const { conv, contact } = rows[0];

  const decision = canSend({
    channel: conv.channel,
    optedOut: contact.optedOut,
    lastInboundAt: conv.lastInboundAt,
  });

  if (!decision.allowed) return { ok: false, reason: decision.reason };

  if (!getAdapter(conv.channel).isEnabled()) {
    return {
      ok: false,
      reason: `El canal ${conv.channel} no tiene credenciales configuradas.`,
    };
  }

  return { ok: true, conv, decision };
}

/** Actualiza la conversación y la línea de tiempo tras un envío exitoso. */
async function recordSent(
  conv: Conversation,
  preview: string,
  author: string,
  now: Date
): Promise<void> {
  await db
    .update(conversations)
    .set({
      lastOutboundAt: now,
      lastMessageAt: now,
      lastMessagePreview: preview.slice(0, 140),
      unreadCount: 0,
    })
    .where(eq(conversations.id, conv.id));

  await db.insert(activities).values({
    contactId: conv.contactId,
    type: "message_out",
    summary: preview.slice(0, 140),
    payload: { channel: conv.channel, author },
  });
}

/**
 * Único camino para mandar un mensaje. Aplica la policy anti-ban ANTES de
 * llamar a Meta: preferimos fallar aquí que registrar una violación en la cuenta.
 */
export async function sendOutbound(
  input: SendOutboundInput
): Promise<SendOutboundResult> {
  const auth = await authorize(input.conversationId);
  if (!auth.ok) return { ok: false, reason: auth.reason };

  const { conv, decision } = auth;
  const adapter = getAdapter(conv.channel);

  // Fuera de las 24 h en WhatsApp: obligatorio plantilla aprobada.
  if (decision.mode === "template_required" && !input.template) {
    return {
      ok: false,
      reason:
        "Pasaron más de 24 h desde el último mensaje del contacto. En WhatsApp solo se puede enviar una plantilla aprobada.",
      needsTemplate: true,
    };
  }

  const now = new Date();

  const [row] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      direction: "outbound",
      type: input.template ? "template" : "text",
      text: input.text,
      status: "queued",
      author: input.author,
      createdAt: now,
    })
    .returning();

  const result =
    input.template && adapter.sendTemplate
      ? await adapter.sendTemplate({
          to: conv.externalId,
          templateName: input.template.name,
          languageCode: input.template.language,
          bodyParams: input.template.params,
        })
      : await adapter.sendText({
          to: conv.externalId,
          text: input.text,
          // Messenger/IG entre 24 h y 7 días: etiqueta de agente humano.
          tag: decision.mode === "human_agent_tag" ? "HUMAN_AGENT" : undefined,
        });

  if (!result.ok) {
    // Fallo transitorio (429, 5xx, red): a la cola. El mensaje queda "queued"
    // en el hilo y /api/cron/outbox lo reintenta con backoff.
    if (result.retryable) {
      await enqueue({
        conversationId: conv.id,
        messageId: row.id,
        channel: conv.channel,
        externalId: conv.externalId,
        payload: input.template
          ? {
              kind: "template",
              text: input.text,
              templateName: input.template.name,
              languageCode: input.template.language,
              bodyParams: input.template.params,
            }
          : {
              kind: "text",
              text: input.text,
              tag: decision.mode === "human_agent_tag" ? "HUMAN_AGENT" : undefined,
            },
        retryAfterSec: result.retryAfterSec,
        error: result.error ?? "Error transitorio",
      });

      await db
        .update(messages)
        .set({ status: "queued", error: result.error ?? null })
        .where(eq(messages.id, row.id));

      await recordSent(conv, input.text, input.author, now);

      return { ok: true, messageId: row.id, queued: true };
    }

    await db
      .update(messages)
      .set({ status: "failed", error: result.error ?? "Error desconocido" })
      .where(eq(messages.id, row.id));

    return {
      ok: false,
      reason: `Meta rechazó el envío: ${result.error ?? "error desconocido"}${
        result.code ? ` (código ${result.code})` : ""
      }`,
    };
  }

  await db
    .update(messages)
    .set({ status: "sent", externalId: result.externalMessageId ?? null })
    .where(eq(messages.id, row.id));

  await recordSent(conv, input.text, input.author, now);

  return { ok: true, messageId: row.id };
}

export interface SendOutboundMediaInput {
  conversationId: number;
  kind: MediaKind;
  data: Uint8Array;
  mime: string;
  filename: string;
  caption?: string;
  author: string;
}

/**
 * Adjuntos salientes. Mismo camino y misma policy que el texto: fuera de la
 * ventana de 24 h WhatsApp solo acepta plantillas, así que el archivo se
 * rechaza aquí en vez de que lo rechace Meta.
 */
export async function sendOutboundMedia(
  input: SendOutboundMediaInput
): Promise<SendOutboundResult> {
  const auth = await authorize(input.conversationId);
  if (!auth.ok) return { ok: false, reason: auth.reason };

  const { conv, decision } = auth;
  const adapter = getAdapter(conv.channel);

  if (!adapter.sendMedia) {
    return {
      ok: false,
      reason: `${conv.channel} no admite adjuntar archivos desde la API oficial. Meta solo acepta URL pública en ese canal.`,
    };
  }

  if (decision.mode === "template_required") {
    return {
      ok: false,
      reason:
        "Pasaron más de 24 h desde el último mensaje del contacto. Fuera de la ventana WhatsApp solo permite plantillas aprobadas, no archivos.",
      needsTemplate: true,
    };
  }

  const now = new Date();
  const preview = input.caption || `📎 ${input.filename}`;

  const [row] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      direction: "outbound",
      type: input.kind,
      text: input.caption ?? input.filename,
      mediaMime: input.mime,
      status: "queued",
      author: input.author,
      createdAt: now,
    })
    .returning();

  const result = await adapter.sendMedia({
    to: conv.externalId,
    kind: input.kind,
    data: input.data,
    mime: input.mime,
    filename: input.filename,
    caption: input.caption,
    tag: decision.mode === "human_agent_tag" ? "HUMAN_AGENT" : undefined,
  });

  // Los adjuntos no se encolan aunque el fallo sea transitorio: la cola guarda
  // JSON, no binarios, y persistir el archivo para reintentarlo obligaría a
  // almacenamiento aparte. El vendedor lo vuelve a adjuntar, que es un clic.
  if (!result.ok) {
    await db
      .update(messages)
      .set({ status: "failed", error: result.error ?? "Error desconocido" })
      .where(eq(messages.id, row.id));

    return {
      ok: false,
      reason: `Meta rechazó el archivo: ${result.error ?? "error desconocido"}${
        result.retryable
          ? " (fallo temporal: vuelve a intentarlo en un momento)"
          : ""
      }${result.code ? ` (código ${result.code})` : ""}`,
    };
  }

  await db
    .update(messages)
    .set({
      status: "sent",
      externalId: result.externalMessageId ?? null,
      // Solo WhatsApp devuelve una referencia reutilizable para previsualizar.
      mediaUrl: result.mediaRef ?? null,
    })
    .where(eq(messages.id, row.id));

  await recordSent(conv, preview, input.author, now);

  return { ok: true, messageId: row.id };
}
