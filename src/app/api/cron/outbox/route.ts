import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { drainOutbox, outboxStats } from "@/lib/messaging/outbox";

/**
 * Drena la cola de salida. Pensado para un cron cada 1–5 minutos:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://tu-crm/api/cron/outbox
 *
 * Solo reintenta lo que falló por causa transitoria (429, 5xx, red) y vuelve a
 * pasar la policy anti-ban antes de cada envío: si la ventana de 24 h se cerró
 * mientras el mensaje esperaba, se descarta en vez de mandarse (docs/ANTI-BAN.md).
 */

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  if (!env.CRON_SECRET) return false;
  const header =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-cron-secret");
  return header === env.CRON_SECRET;
}

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Falta CRON_SECRET: la ruta está deshabilitada." },
      { status: 503 }
    );
  }

  if (!authorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const startedAt = new Date();

  try {
    const result = await drainOutbox();
    const pending = await outboxStats();

    return NextResponse.json({
      ranAt: startedAt.toISOString(),
      ms: Date.now() - startedAt.getTime(),
      ...result,
      pending,
    });
  } catch (e) {
    // Un fallo aquí no debe tumbar el cron: se reporta y la siguiente corrida
    // vuelve a tomar las mismas filas.
    console.error("[cron:outbox] Error drenando la cola:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
