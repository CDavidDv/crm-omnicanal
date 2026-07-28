import { NextResponse } from "next/server";
import { adapters, CHANNEL_LABEL } from "@/lib/channels";
import type { Channel } from "@/lib/db/schema";

/** Estado en vivo de los 3 canales — alimenta Configuración > Canales. */
export async function GET() {
  const entries = await Promise.all(
    (Object.keys(adapters) as Channel[]).map(async (channel) => {
      const adapter = adapters[channel];
      if (!adapter.isEnabled()) {
        return {
          channel,
          label: CHANNEL_LABEL[channel],
          configured: false,
          ok: false,
          detail: "Sin credenciales. Ver docs/CREDENCIALES.md",
        };
      }
      const health = await adapter.healthCheck();
      return {
        channel,
        label: CHANNEL_LABEL[channel],
        configured: true,
        ok: health.ok,
        detail: health.detail,
      };
    })
  );

  return NextResponse.json(entries);
}
