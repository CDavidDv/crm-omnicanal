import type { Channel } from "@/lib/db/schema";
import { waitForSlot } from "./rate-limit";
import type { SendResult } from "./types";

/**
 * Único punto de salida hacia Graph API. Existe por la Regla #1: los reintentos
 * agresivos y el ignorar un 429 son de las formas más rápidas de que Meta
 * limite o bloquee la cuenta (ver docs/ANTI-BAN.md).
 *
 * Hace dos cosas:
 *   1. Espacia las llamadas por canal, para no llegar al límite
 *   2. Ante un 429 o un error transitorio, espera lo que Meta pida y reintenta
 *      un par de veces; si sigue fallando lo declara reintentable y la cola de
 *      salida se encarga (src/lib/messaging/outbox.ts)
 *
 * El espaciado se reserva en la base de datos (channels/rate-limit.ts), no en
 * memoria: en Cloudflare Workers cada petición corre en su propio aislamiento
 * y un contador en memoria daría a cada uno el suyo, dejando el canal sin
 * espaciado real justo bajo carga.
 */

/** Reintentos dentro de la misma petición. Lo demás lo hereda la cola. */
const MAX_INLINE_RETRIES = 2;
/** Tope de espera por reintento: más allá conviene soltar y encolar. */
const MAX_BACKOFF_MS = 8_000;

/**
 * Códigos de error de Meta que significan "vuelve a intentar más tarde".
 * El resto (token inválido, número inexistente, plantilla no aprobada…) no
 * mejora reintentando: reintentarlos solo suma ruido a la cuenta.
 */
const RETRYABLE_META_CODES = new Set([
  4, // Application request limit reached
  613, // Calls to this api have exceeded the rate limit
  80007, // Rate limit issues (WhatsApp Business Account)
  130429, // Cloud API message throughput limit
  131048, // Spam rate limit hit
  131056, // Pair rate limit hit (mismo par emisor/receptor)
  368, // Temporarily blocked for policies violations
  1, // API Unknown — Meta lo marca como transitorio
  2, // API Service — caída temporal
]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Meta manda `Retry-After` en segundos; si no viene, backoff exponencial. */
function backoffMs(attempt: number, retryAfter: string | null): number {
  const fromHeader = retryAfter ? Number(retryAfter) * 1000 : NaN;
  const base = Number.isFinite(fromHeader) && fromHeader > 0
    ? fromHeader
    : 2 ** attempt * 500;
  // Jitter: evita que varios envíos reintenten en el mismo instante.
  const jitter = Math.random() * 250;
  return Math.min(base + jitter, MAX_BACKOFF_MS);
}

export interface GraphError {
  message: string;
  code?: number;
  /** true = el fallo puede desaparecer solo; encolar en vez de descartar. */
  retryable: boolean;
  /** Segundos que Meta pidió esperar, si los mandó. */
  retryAfterSec?: number;
}

export type GraphResponse<T = any> =
  | { ok: true; data: T }
  | { ok: false; error: GraphError };

/** Exportada para poder probarla: es la regla que decide si se reintenta. */
export function classifyGraphError(status: number, body: any): GraphError {
  const err = body?.error ?? {};
  const code: number | undefined = err.code;

  const retryable =
    status === 429 ||
    status >= 500 ||
    err.is_transient === true ||
    (typeof code === "number" && RETRYABLE_META_CODES.has(code));

  return {
    message: err.message ?? `HTTP ${status}`,
    code,
    retryable,
  };
}

/**
 * Hace la llamada respetando el espaciado del canal y reintentando lo
 * transitorio. `init` es el mismo de `fetch`.
 */
export async function graphFetch<T = any>(
  channel: Channel,
  url: string,
  init: RequestInit
): Promise<GraphResponse<T>> {
  let lastError: GraphError = {
    message: "Sin respuesta de Meta",
    retryable: true,
  };

  for (let attempt = 0; attempt <= MAX_INLINE_RETRIES; attempt++) {
    // Reserva turno en la marca compartida antes de cada intento, incluidos
    // los reintentos: un 429 no autoriza a saltarse el espaciado.
    await waitForSlot(channel);

    try {
      const res = await fetch(url, init);

      // 204 y similares no traen cuerpo JSON.
      const text = await res.text();
      const body = text ? safeJson(text) : {};

      if (res.ok) return { ok: true, data: body as T };

      const error = classifyGraphError(res.status, body);
      const retryAfter = res.headers.get("retry-after");
      if (retryAfter) error.retryAfterSec = Number(retryAfter) || undefined;

      if (!error.retryable || attempt === MAX_INLINE_RETRIES) {
        if (error.retryable) {
          console.warn(
            `[graph:${channel}] agotados los reintentos en línea (${error.message}). Pasa a la cola.`
          );
        }
        return { ok: false, error };
      }

      console.warn(
        `[graph:${channel}] ${error.message} — reintento ${attempt + 1}/${MAX_INLINE_RETRIES}`
      );
      lastError = error;
      await sleep(backoffMs(attempt, retryAfter));
    } catch (e) {
      // Fallo de red: siempre reintentable, nunca es rechazo de Meta.
      lastError = {
        message: e instanceof Error ? e.message : String(e),
        retryable: true,
      };
      if (attempt === MAX_INLINE_RETRIES) return { ok: false, error: lastError };
      await sleep(backoffMs(attempt, null));
    }
  }

  return { ok: false, error: lastError };
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text.slice(0, 300) } };
  }
}

/** Adapta la respuesta de Graph al SendResult que esperan los adaptadores. */
export function toSendResult(
  res: GraphResponse,
  extractId: (data: any) => string | undefined
): SendResult {
  if (res.ok) {
    return { ok: true, externalMessageId: extractId(res.data) };
  }
  return {
    ok: false,
    error: res.error.message,
    code: res.error.code,
    retryable: res.error.retryable,
    retryAfterSec: res.error.retryAfterSec,
  };
}
