import type { Channel } from "@/lib/db/schema";
import type { ChannelAdapter } from "./types";

/**
 * Adaptador falso para desarrollo local. Se activa con MOCK_CHANNELS=1 y
 * SUSTITUYE la llamada HTTP a Graph API por una respuesta simulada.
 *
 * Qué SÍ hace: permite probar la bandeja, la ventana de 24 h, la plantilla
 * obligatoria y el bloqueo por opt-out sin credenciales de Meta.
 * Qué NO hace: automatizar WhatsApp/Facebook/Instagram por ningún otro medio.
 * No sale un solo byte hacia Meta, así que no hay superficie de ban.
 *
 * La policy anti-ban corre ANTES de llegar aquí (src/lib/messaging/send.ts),
 * o sea que el mock no la puede saltar: lo que la policy rechaza nunca llega.
 *
 * En producción está prohibido: src/lib/env.ts revienta el arranque si la
 * variable aparece con NODE_ENV=production.
 */
function fakeId(channel: Channel): string {
  const rand = Math.random().toString(36).slice(2, 12);
  return channel === "whatsapp" ? `wamid.MOCK${rand}` : `mid.MOCK${rand}`;
}

export function createMockAdapter(channel: Channel): ChannelAdapter {
  const log = (action: string, detail: Record<string, unknown>) =>
    console.log(`[MOCK ${channel}] ${action}`, detail);

  return {
    channel,

    isEnabled: () => true,

    async sendText({ to, text, tag }) {
      log("sendText", { to, text: text.slice(0, 80), tag });
      return { ok: true, externalMessageId: fakeId(channel) };
    },

    async sendTemplate({ to, templateName, languageCode, bodyParams }) {
      log("sendTemplate", { to, templateName, languageCode, bodyParams });
      return { ok: true, externalMessageId: fakeId(channel) };
    },

    async sendMedia({ to, kind, mime, filename, data }) {
      log("sendMedia", { to, kind, mime, filename, bytes: data.byteLength });
      return {
        ok: true,
        externalMessageId: fakeId(channel),
        // Sin media real que resolver: el proxy /api/media no debe intentarlo.
        mediaRef: undefined,
      };
    },

    async healthCheck() {
      return { ok: true, detail: "MOCK — sin conexión real con Meta" };
    },
  };
}
