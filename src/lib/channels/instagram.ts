import { GRAPH, channelConfig } from "@/lib/env";
import { sendMetaMessage } from "./messenger";
import type { ChannelAdapter } from "./types";

/**
 * Instagram Messaging API — oficial, sobre Messenger Platform.
 * Requisitos: cuenta profesional vinculada a una Página y "Permitir acceso a
 * mensajes" activado en la app de Instagram.
 * Docs: https://developers.facebook.com/docs/messenger-platform/instagram
 */

const cfg = channelConfig.instagram;

export const instagramAdapter: ChannelAdapter = {
  channel: "instagram",

  isEnabled: () => cfg.enabled,

  sendText: (req) => sendMetaMessage("instagram", cfg.accountId, cfg.token, req),

  async healthCheck() {
    if (!cfg.enabled) {
      return {
        ok: false,
        detail: "Faltan INSTAGRAM_ACCOUNT_ID o INSTAGRAM_ACCESS_TOKEN",
      };
    }
    try {
      const res = await fetch(
        `${GRAPH}/${cfg.accountId}?fields=username,name,followers_count`,
        { headers: { Authorization: `Bearer ${cfg.token}` } }
      );
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, detail: data?.error?.message ?? `HTTP ${res.status}` };
      }
      return {
        ok: true,
        detail: `@${data.username ?? "—"} · ${data.followers_count ?? 0} seguidores`,
      };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  },
};
