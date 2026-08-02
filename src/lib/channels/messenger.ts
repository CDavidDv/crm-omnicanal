import { GRAPH, channelConfig } from "@/lib/env";
import type {
  ChannelAdapter,
  InboundMessage,
  SendMediaRequest,
  SendResult,
  SendTextRequest,
} from "./types";

/**
 * Messenger Platform (Facebook) — API oficial.
 * Docs: https://developers.facebook.com/docs/messenger-platform
 */

const cfg = channelConfig.messenger;

/** Compartido con Instagram: el formato de envío es el mismo. */
export async function sendMetaMessage(
  endpointId: string | undefined,
  token: string | undefined,
  { to, text, tag }: SendTextRequest
): Promise<SendResult> {
  if (!endpointId || !token) {
    return { ok: false, error: "Canal no configurado" };
  }

  try {
    const res = await fetch(`${GRAPH}/${endpointId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: to },
        // MESSAGE_TAG solo cuando la policy lo autorizó (fuera de 24 h).
        messaging_type: tag ? "MESSAGE_TAG" : "RESPONSE",
        ...(tag ? { tag } : {}),
        message: { text },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        ok: false,
        error: data?.error?.message ?? `HTTP ${res.status}`,
        code: data?.error?.code,
      };
    }

    return { ok: true, externalMessageId: data?.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Messenger sí admite subir el binario en el mismo POST (`filedata`), a
 * diferencia de WhatsApp. Instagram no lo soporta: allí Meta exige una URL
 * pública, por eso su adaptador no implementa `sendMedia`.
 */
async function sendMessengerMedia(
  { to, kind, data, mime, filename, tag }: SendMediaRequest
): Promise<SendResult> {
  if (!cfg.enabled) return { ok: false, error: "Canal Messenger no configurado" };

  const form = new FormData();
  form.append("recipient", JSON.stringify({ id: to }));
  form.append("messaging_type", tag ? "MESSAGE_TAG" : "RESPONSE");
  if (tag) form.append("tag", tag);
  form.append(
    "message",
    JSON.stringify({
      attachment: {
        // Messenger llama "file" a lo que el resto del CRM llama "document".
        type: kind === "document" ? "file" : kind,
        payload: { is_reusable: true },
      },
    })
  );
  form.append(
    "filedata",
    new Blob([data as unknown as BlobPart], { type: mime }),
    filename
  );

  try {
    const res = await fetch(`${GRAPH}/${cfg.pageId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}` },
      body: form,
    });
    const result = await res.json();

    if (!res.ok) {
      return {
        ok: false,
        error: result?.error?.message ?? `HTTP ${res.status}`,
        code: result?.error?.code,
      };
    }
    return { ok: true, externalMessageId: result?.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const messengerAdapter: ChannelAdapter = {
  channel: "messenger",

  isEnabled: () => cfg.enabled,

  sendText: (req) => sendMetaMessage(cfg.pageId, cfg.token, req),

  sendMedia: sendMessengerMedia,

  async healthCheck() {
    if (!cfg.enabled) {
      return { ok: false, detail: "Faltan FACEBOOK_PAGE_ID o FACEBOOK_PAGE_ACCESS_TOKEN" };
    }
    try {
      const res = await fetch(
        `${GRAPH}/${cfg.pageId}?fields=name,category`,
        { headers: { Authorization: `Bearer ${cfg.token}` } }
      );
      const data = await res.json();
      if (!res.ok) return { ok: false, detail: data?.error?.message ?? `HTTP ${res.status}` };

      // Confirmar que la Página está suscrita a la app: sin esto no llegan webhooks.
      const sub = await fetch(`${GRAPH}/${cfg.pageId}/subscribed_apps`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });
      const subData = await sub.json();
      const subscribed = Array.isArray(subData?.data) && subData.data.length > 0;

      return {
        ok: subscribed,
        detail: subscribed
          ? `Página "${data.name}" suscrita a la app`
          : `Página "${data.name}" NO suscrita: no llegarán mensajes`,
      };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  },
};

// -----------------------------------------------------------------------------
// Parseo del webhook (mismo formato en Messenger e Instagram)
// -----------------------------------------------------------------------------

type MessagingEvent = {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type: string; payload?: { url?: string } }>;
  };
  postback?: { mid?: string; title?: string; payload?: string };
};

const ATTACH_MAP: Record<string, InboundMessage["type"]> = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "document",
  location: "location",
};

export function parseMessagingEvents(
  events: MessagingEvent[],
  channel: "messenger" | "instagram"
): InboundMessage[] {
  const out: InboundMessage[] = [];

  for (const e of events) {
    // Los echo son mensajes que enviamos nosotros; ya están en la DB.
    if (e.message?.is_echo) continue;

    const senderId = e.sender?.id;
    if (!senderId) continue;

    const ts = e.timestamp ? new Date(e.timestamp) : new Date();

    if (e.message) {
      const attachment = e.message.attachments?.[0];
      out.push({
        channel,
        externalUserId: senderId,
        externalMessageId: e.message.mid,
        type: attachment ? (ATTACH_MAP[attachment.type] ?? "unsupported") : "text",
        text: e.message.text,
        mediaUrl: attachment?.payload?.url,
        timestamp: ts,
        raw: e as unknown as Record<string, unknown>,
      });
      continue;
    }

    if (e.postback) {
      out.push({
        channel,
        externalUserId: senderId,
        externalMessageId: e.postback.mid ?? `postback-${senderId}-${ts.getTime()}`,
        type: "text",
        text: e.postback.title ?? e.postback.payload,
        timestamp: ts,
        raw: e as unknown as Record<string, unknown>,
      });
    }
  }

  return out;
}

/** Nombre y foto del contacto. Messenger e Instagram exponen campos distintos. */
export async function fetchProfile(
  externalId: string,
  channel: "messenger" | "instagram"
): Promise<{ name?: string; avatarUrl?: string }> {
  const token =
    channel === "messenger" ? cfg.token : channelConfig.instagram.token;
  if (!token) return {};

  const fields =
    channel === "messenger" ? "name,profile_pic" : "name,username,profile_pic";

  try {
    const res = await fetch(`${GRAPH}/${externalId}?fields=${fields}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return {};
    const data = await res.json();
    return {
      name: data.name ?? data.username,
      avatarUrl: data.profile_pic,
    };
  } catch {
    return {};
  }
}
