import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Channel } from "@/lib/db/schema";

/**
 * Reserva de turno para llamar a Graph API, compartida entre aislamientos.
 *
 * En un proceso largo bastaba una variable en memoria. En Cloudflare Workers
 * cada petición corre aislada, así que el estado vive en Postgres: un UPDATE
 * atómico avanza la marca y devuelve el turno que le tocó a quien llama. Dos
 * peticiones simultáneas obtienen turnos distintos, nunca el mismo.
 *
 * Si la reserva falla (DB caída, tabla sin sembrar) se degrada a una espera
 * fija en vez de propagar el error: quedarse sin espaciado es malo, pero no
 * mandar el mensaje del vendedor es peor, y Meta tolera de sobra este ritmo.
 */

/**
 * Milisegundos mínimos entre llamadas por canal. Meta admite bastante más
 * (WhatsApp Cloud API ronda 80 msg/s), pero un CRM de ventas no necesita ese
 * ritmo y el volumen alto es lo que dispara las revisiones de calidad.
 */
export const MIN_GAP_MS: Record<Channel, number> = {
  whatsapp: 125, // ~8/s
  messenger: 100, // ~10/s
  instagram: 100,
};

/** Tope de espera: más allá conviene soltar y dejar que la cola reintente. */
const MAX_WAIT_MS = 5_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Espera lo necesario para respetar el espaciado del canal.
 * Devuelve los milisegundos que se esperó, útil para depurar.
 */
export async function waitForSlot(channel: Channel): Promise<number> {
  const gap = MIN_GAP_MS[channel];

  let waitMs: number;

  try {
    // Avanza la marca y devuelve el turno asignado a esta llamada.
    // greatest(now(), next_available_at) evita acumular deuda cuando el canal
    // lleva rato inactivo: el turno es "ya", no una hora vieja.
    const rows = await db.execute<{ wait_ms: number }>(sql`
      insert into rate_limits (channel, next_available_at)
      values (${channel}, now() + (${gap}::int * interval '1 millisecond'))
      on conflict (channel) do update
        set next_available_at =
          greatest(now(), rate_limits.next_available_at)
          + (${gap}::int * interval '1 millisecond')
      returning greatest(
        0,
        extract(epoch from (next_available_at - now())) * 1000 - ${gap}::int
      )::int as wait_ms
    `);

    waitMs = Number(rows.rows?.[0]?.wait_ms ?? 0);
  } catch (e) {
    console.warn(
      `[rate-limit:${channel}] no se pudo reservar turno, se aplica espera fija:`,
      e instanceof Error ? e.message : e
    );
    waitMs = gap;
  }

  if (waitMs > MAX_WAIT_MS) waitMs = MAX_WAIT_MS;
  if (waitMs > 0) await sleep(waitMs);

  return waitMs;
}
