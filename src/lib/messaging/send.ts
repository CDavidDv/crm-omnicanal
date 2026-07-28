import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, contacts, conversations, messages } from "@/lib/db/schema";
import { getAdapter } from "@/lib/channels";
import { canSend } from "@/lib/channels/policy";

export interface SendOutboundInput {
  conversationId: number;
  text: string;
  author: string;
  /** Solo WhatsApp y solo fuera de la ventana de 24 h. */
  template?: { name: string; language: string; params?: string[] };
}

export type SendOutboundResult =
  | { ok: true; messageId: number }
  | { ok: false; reason: string; needsTemplate?: boolean };

/**
 * Único camino para mandar un mensaje. Aplica la policy anti-ban ANTES de
 * llamar a Meta: preferimos fallar aquí que registrar una violación en la cuenta.
 */
export async function sendOutbound(
  input: SendOutboundInput
): Promise<SendOutboundResult> {
  const rows = await db
    .select({
      conv: conversations,
      contact: contacts,
    })
    .from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(eq(conversations.id, input.conversationId))
    .limit(1);

  if (rows.length === 0) return { ok: false, reason: "Conversación no encontrada" };

  const { conv, contact } = rows[0];

  const decision = canSend({
    channel: conv.channel,
    optedOut: contact.optedOut,
    lastInboundAt: conv.lastInboundAt,
  });

  if (!decision.allowed) return { ok: false, reason: decision.reason };

  const adapter = getAdapter(conv.channel);

  if (!adapter.isEnabled()) {
    return {
      ok: false,
      reason: `El canal ${conv.channel} no tiene credenciales configuradas.`,
    };
  }

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

  await db
    .update(conversations)
    .set({
      lastOutboundAt: now,
      lastMessageAt: now,
      lastMessagePreview: input.text.slice(0, 140),
      unreadCount: 0,
    })
    .where(eq(conversations.id, conv.id));

  await db.insert(activities).values({
    contactId: conv.contactId,
    type: "message_out",
    summary: input.text.slice(0, 140),
    payload: { channel: conv.channel, author: input.author },
  });

  return { ok: true, messageId: row.id };
}
