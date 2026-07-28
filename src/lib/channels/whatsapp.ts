import { GRAPH, channelConfig } from "@/lib/env";
import type {
  ChannelAdapter,
  SendResult,
  SendTextRequest,
  SendTemplateRequest,
  InboundMessage,
} from "./types";

/**
 * WhatsApp Cloud API — producto oficial de Meta. Sin riesgo de ban por método.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const cfg = channelConfig.whatsapp;

async function post(body: unknown): Promise<SendResult> {
  if (!cfg.enabled) {
    return { ok: false, error: "Canal WhatsApp no configurado" };
  }

  try {
    const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      const err = data?.error;
      return {
        ok: false,
        error: err?.message ?? `HTTP ${res.status}`,
        code: err?.code,
      };
    }

    return { ok: true, externalMessageId: data?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const whatsappAdapter: ChannelAdapter = {
  channel: "whatsapp",

  isEnabled: () => cfg.enabled,

  async sendText({ to, text }: SendTextRequest) {
    return post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    });
  },

  /** Único camino permitido fuera de la ventana de 24 h. */
  async sendTemplate({
    to,
    templateName,
    languageCode,
    bodyParams,
  }: SendTemplateRequest) {
    return post({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: bodyParams?.length
          ? [
              {
                type: "body",
                parameters: bodyParams.map((t) => ({ type: "text", text: t })),
              },
            ]
          : undefined,
      },
    });
  },

  async healthCheck() {
    if (!cfg.enabled) {
      return { ok: false, detail: "Faltan WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_ACCESS_TOKEN" };
    }
    try {
      const res = await fetch(
        `${GRAPH}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${cfg.token}` } }
      );
      const data = await res.json();
      if (!res.ok) return { ok: false, detail: data?.error?.message ?? `HTTP ${res.status}` };
      return {
        ok: true,
        detail: `${data.verified_name ?? "—"} · ${data.display_phone_number ?? "—"} · calidad: ${data.quality_rating ?? "n/d"}`,
      };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  },
};

/** Marca el mensaje como leído (doble palomita azul) — mejora la percepción. */
export async function markAsRead(externalMessageId: string): Promise<void> {
  if (!cfg.enabled) return;
  await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: externalMessageId,
    }),
  }).catch(() => {});
}

/**
 * La media de WhatsApp llega como ID: hay que pedir la URL y descargarla con el
 * token (la URL caduca a los 5 minutos).
 */
export async function resolveMediaUrl(mediaId: string): Promise<string | null> {
  if (!cfg.enabled) return null;
  try {
    const res = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url ?? null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Parseo del webhook
// -----------------------------------------------------------------------------

type WaValue = {
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
  messages?: Array<Record<string, any>>;
  statuses?: Array<Record<string, any>>;
};

const TYPE_MAP: Record<string, InboundMessage["type"]> = {
  text: "text",
  image: "image",
  audio: "audio",
  video: "video",
  document: "document",
  sticker: "sticker",
  location: "location",
};

export function parseWhatsAppEntry(value: WaValue): InboundMessage[] {
  const out: InboundMessage[] = [];
  const profileName = value.contacts?.[0]?.profile?.name;

  for (const m of value.messages ?? []) {
    const type = TYPE_MAP[m.type] ?? "unsupported";
    const mediaNode = m[m.type];

    out.push({
      channel: "whatsapp",
      externalUserId: m.from,
      externalMessageId: m.id,
      type,
      text:
        m.text?.body ??
        mediaNode?.caption ??
        (m.type === "location"
          ? `📍 ${mediaNode?.name ?? ""} (${mediaNode?.latitude}, ${mediaNode?.longitude})`
          : undefined),
      // Se guarda el media id; la URL se resuelve al abrir el mensaje.
      mediaUrl: mediaNode?.id ? `wa-media:${mediaNode.id}` : undefined,
      mediaMime: mediaNode?.mime_type,
      displayName: profileName,
      timestamp: new Date(Number(m.timestamp) * 1000),
      raw: m,
    });
  }

  return out;
}

export function parseWhatsAppStatuses(value: WaValue) {
  return (value.statuses ?? []).map((s) => ({
    channel: "whatsapp" as const,
    externalMessageId: s.id as string,
    status: (s.status === "failed" ? "failed" : s.status) as
      | "sent"
      | "delivered"
      | "read"
      | "failed",
    error: s.errors?.[0]?.title as string | undefined,
  }));
}
