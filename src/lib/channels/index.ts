import type { Channel } from "@/lib/db/schema";
import { MOCK_CHANNELS } from "@/lib/env";
import type { ChannelAdapter } from "./types";
import { whatsappAdapter } from "./whatsapp";
import { messengerAdapter } from "./messenger";
import { instagramAdapter } from "./instagram";
import { createMockAdapter } from "./mock";

/**
 * Registro único de canales. Ningún módulo debe llamar a Graph API por su
 * cuenta: todo pasa por estos adaptadores (ver docs/ANTI-BAN.md).
 *
 * Con MOCK_CHANNELS=1 (solo desarrollo) se cambian por mocks que no salen a
 * internet. La policy anti-ban sigue corriendo antes, en send.ts.
 */
export const adapters: Record<Channel, ChannelAdapter> = MOCK_CHANNELS
  ? {
      whatsapp: createMockAdapter("whatsapp"),
      messenger: createMockAdapter("messenger"),
      instagram: createMockAdapter("instagram"),
    }
  : {
      whatsapp: whatsappAdapter,
      messenger: messengerAdapter,
      instagram: instagramAdapter,
    };

if (MOCK_CHANNELS) {
  console.warn(
    "⚠️  MOCK_CHANNELS=1 — los 3 canales están simulados. Nada sale hacia Meta."
  );
}

export function getAdapter(channel: Channel): ChannelAdapter {
  return adapters[channel];
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
};

export * from "./types";
export { canSend, isOptOut, windowRemainingHours } from "./policy";
