import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, conversations, messages, outbox } from "@/lib/db/schema";
import type { Channel } from "@/lib/db/schema";
import { getAdapter } from "@/lib/channels";
import { canSend } from "@/lib/channels/policy";

/**
 * Cola de salida. Solo entra aquí lo que falló por causa transitoria: un 429,
 * un 5xx o un corte de red. Un rechazo definitivo de Meta (token inválido,
 * plantilla no aprobada, destinatario inexistente) NO se reintenta: insistir
 * sobre un rechazo es exactamente lo que degrada la calidad de la cuenta.
 *
 * El drenado lo dispara /api/cron/outbox, no un worker en memoria: así funciona
 * igual con una instancia o con varias, y sobrevive a los reinicios del deploy.
 */

/** Cuántas veces se reintenta antes de darlo por perdido. */
const MAX_ATTEMPTS = 5;
/** Espera entre intentos: 1, 4, 9, 16, 25 minutos. Crece rápido a propósito. */
const backoffMinutes = (attempts: number) => attempts ** 2;

export type OutboxPayload =
  | { kind: "text"; text: string; tag?: "HUMAN_AGENT" }
  | {
      kind: "template";
      text: string;
      templateName: string;
      languageCode: string;
      bodyParams?: string[];
    };

export interface EnqueueInput {
  conversationId: number;
  messageId: number;
  channel: Channel;
  externalId: string;
  payload: OutboxPayload;
  /** Segundos que pidió Meta esperar, si mandó Retry-After. */
  retryAfterSec?: number;
  error: string;
}

/** Registra un envío fallido para reintentarlo más tarde. */
export async function enqueue(input: EnqueueInput): Promise<void> {
  const delayMs = Math.max(
    (input.retryAfterSec ?? 0) * 1000,
    backoffMinutes(1) * 60_000
  );

  await db.insert(outbox).values({
    conversationId: input.conversationId,
    messageId: input.messageId,
    channel: input.channel,
    externalId: input.externalId,
    payload: input.payload as unknown as Record<string, unknown>,
    status: "queued",
    attempts: 1,
    lastError: input.error,
    scheduledAt: new Date(Date.now() + delayMs),
  });
}

export interface DrainResult {
  processed: number;
  sent: number;
  requeued: number;
  failed: number;
  blocked: number;
}

/**
 * Procesa lo que ya toca reintentar. `limit` acota el trabajo por corrida para
 * no pasarse del tiempo de ejecución del cron.
 */
export async function drainOutbox(limit = 25): Promise<DrainResult> {
  const now = new Date();
  const result: DrainResult = {
    processed: 0,
    sent: 0,
    requeued: 0,
    failed: 0,
    blocked: 0,
  };

  await recoverStaleClaims(now);

  const due = await db
    .select()
    .from(outbox)
    .where(and(eq(outbox.status, "queued"), lte(outbox.scheduledAt, now)))
    .orderBy(asc(outbox.scheduledAt))
    .limit(limit);

  for (const row of due) {
    result.processed++;

    // Marca "sending" antes de salir: si el proceso muere a media llamada, la
    // fila no queda elegible para que otra instancia la mande duplicada.
    const claimed = await db
      .update(outbox)
      .set({ status: "sending" })
      .where(and(eq(outbox.id, row.id), eq(outbox.status, "queued")))
      .returning({ id: outbox.id });

    if (claimed.length === 0) {
      result.processed--;
      continue; // otra instancia se la llevó
    }

    // La ventana pudo cerrarse o el contacto pudo darse de baja mientras la
    // fila esperaba. La policy manda, incluso sobre algo ya encolado.
    const allowed = await stillAllowed(row.conversationId, row.channel);

    if (!allowed.ok) {
      await db
        .update(outbox)
        .set({ status: "blocked", lastError: allowed.reason })
        .where(eq(outbox.id, row.id));

      if (row.messageId) {
        await db
          .update(messages)
          .set({ status: "failed", error: allowed.reason })
          .where(eq(messages.id, row.messageId));
      }

      result.blocked++;
      continue;
    }

    const payload = row.payload as unknown as OutboxPayload;
    const adapter = getAdapter(row.channel);

    const sendResult =
      payload.kind === "template" && adapter.sendTemplate
        ? await adapter.sendTemplate({
            to: row.externalId,
            templateName: payload.templateName,
            languageCode: payload.languageCode,
            bodyParams: payload.bodyParams,
          })
        : await adapter.sendText({
            to: row.externalId,
            text: payload.text,
            tag: allowed.tag,
          });

    if (sendResult.ok) {
      await db
        .update(outbox)
        .set({ status: "sent", sentAt: new Date(), lastError: null })
        .where(eq(outbox.id, row.id));

      if (row.messageId) {
        await db
          .update(messages)
          .set({
            status: "sent",
            externalId: sendResult.externalMessageId ?? null,
            error: null,
          })
          .where(eq(messages.id, row.messageId));
      }

      await db
        .update(conversations)
        .set({ lastOutboundAt: new Date() })
        .where(eq(conversations.id, row.conversationId));

      result.sent++;
      continue;
    }

    const attempts = row.attempts + 1;
    const permanent = !sendResult.retryable || attempts >= MAX_ATTEMPTS;

    if (permanent) {
      const reason = sendResult.retryable
        ? `Sin éxito tras ${attempts} intentos: ${sendResult.error}`
        : sendResult.error ?? "Rechazado por Meta";

      await db
        .update(outbox)
        .set({ status: "failed", attempts, lastError: reason })
        .where(eq(outbox.id, row.id));

      if (row.messageId) {
        await db
          .update(messages)
          .set({ status: "failed", error: reason })
          .where(eq(messages.id, row.messageId));
      }

      result.failed++;
      continue;
    }

    const delayMs = Math.max(
      (sendResult.retryAfterSec ?? 0) * 1000,
      backoffMinutes(attempts) * 60_000
    );

    await db
      .update(outbox)
      .set({
        status: "queued",
        attempts,
        lastError: sendResult.error ?? null,
        scheduledAt: new Date(Date.now() + delayMs),
      })
      .where(eq(outbox.id, row.id));

    result.requeued++;
  }

  return result;
}

/**
 * Minutos tras los que una fila en "sending" se da por abandonada. Un deploy o
 * un reinicio a media llamada la dejaría atascada para siempre.
 *
 * El riesgo del rescate es mandar dos veces si Meta sí recibió la primera. Se
 * asume porque la alternativa —perder el mensaje en silencio— es peor para un
 * CRM de ventas, y 10 minutos es holgado frente a cualquier llamada real.
 */
const STALE_SENDING_MINUTES = 10;

async function recoverStaleClaims(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - STALE_SENDING_MINUTES * 60_000);

  const recovered = await db
    .update(outbox)
    .set({ status: "queued" })
    .where(and(eq(outbox.status, "sending"), lte(outbox.scheduledAt, cutoff)))
    .returning({ id: outbox.id });

  if (recovered.length > 0) {
    console.warn(
      `[outbox] ${recovered.length} envío(s) quedaron en "sending" y vuelven a la cola.`
    );
  }
}

/** Vuelve a pasar la policy anti-ban con el estado actual de la conversación. */
async function stillAllowed(
  conversationId: number,
  channel: Channel
): Promise<
  { ok: true; tag?: "HUMAN_AGENT" } | { ok: false; reason: string }
> {
  const rows = await db
    .select({ conv: conversations, contact: contacts })
    .from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (rows.length === 0) return { ok: false, reason: "Conversación eliminada" };

  const { conv, contact } = rows[0];

  const decision = canSend({
    channel,
    optedOut: contact.optedOut,
    lastInboundAt: conv.lastInboundAt,
  });

  if (!decision.allowed) return { ok: false, reason: decision.reason };

  // La ventana se cerró mientras esperaba: mandar el texto libre ahora sería
  // una violación. Se descarta y el vendedor decide si usa plantilla.
  if (decision.mode === "template_required") {
    return {
      ok: false,
      reason:
        "La ventana de 24 h se cerró mientras el mensaje esperaba en la cola. " +
        "Fuera de la ventana solo se puede enviar una plantilla aprobada.",
    };
  }

  return {
    ok: true,
    tag: decision.mode === "human_agent_tag" ? "HUMAN_AGENT" : undefined,
  };
}

/** Resumen para la pantalla de reportes. */
export async function outboxStats() {
  const rows = await db
    .select({ status: outbox.status, count: sql<number>`count(*)::int` })
    .from(outbox)
    .groupBy(outbox.status);

  return Object.fromEntries(rows.map((r) => [r.status, r.count])) as Partial<
    Record<"queued" | "sending" | "sent" | "failed" | "blocked", number>
  >;
}
