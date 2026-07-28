import type { Channel } from "@/lib/db/schema";
import type { ChannelAdapter } from "./types";
import { whatsappAdapter } from "./whatsapp";
import { messengerAdapter } from "./messenger";
import { instagramAdapter } from "./instagram";

/**
 * Registro único de canales. Ningún módulo debe llamar a Graph API por su
 * cuenta: todo pasa por estos adaptadores (ver docs/ANTI-BAN.md).
 */
export const adapters: Record<Channel, ChannelAdapter> = {
  whatsapp: whatsappAdapter,
  messenger: messengerAdapter,
  instagram: instagramAdapter,
};

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
