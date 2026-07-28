import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  parseWhatsAppEntry,
  parseWhatsAppStatuses,
  markAsRead,
} from "@/lib/channels/whatsapp";
import { parseMessagingEvents } from "@/lib/channels/messenger";
import { ingestInbound, ingestStatus } from "@/lib/messaging/ingest";
import type { Channel } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook ÚNICO para los tres canales.
 * Meta exige responder 200 en menos de ~5 s; si fallamos repetidamente,
 * desuscribe la app. Por eso: guardar, responder 200, y que ningún error
 * de procesamiento cambie el status code.
 */

// -----------------------------------------------------------------------------
// GET — verificación del webhook (Meta manda hub.challenge una sola vez)
// -----------------------------------------------------------------------------
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (!env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse("META_WEBHOOK_VERIFY_TOKEN sin configurar", {
      status: 500,
    });
  }

  if (mode === "subscribe" && token === env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// -----------------------------------------------------------------------------
// POST — eventos
// -----------------------------------------------------------------------------
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const signatureOk = verifySignature(raw, signature);

  // Firma inválida => no es Meta (o el APP_SECRET está mal). Se registra y corta.
  if (!signatureOk) {
    await logEvent(null, false, safeParse(raw), "Firma X-Hub-Signature-256 inválida");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const body = safeParse(raw);
  const channel = detectChannel(body);

  const [event] = await db
    .insert(webhookEvents)
    .values({ channel, signatureOk: true, payload: body })
    .returning({ id: webhookEvents.id });

  try {
    await process(body);
    await db
      .update(webhookEvents)
      .set({ processed: true })
      .where(eq(webhookEvents.id, event.id));
  } catch (e) {
    // Nunca devolver 5xx: Meta reintentaría y penalizaría la app.
    console.error("[webhook] Error procesando evento:", e);
    await db
      .update(webhookEvents)
      .set({ error: e instanceof Error ? e.message : String(e) })
      .where(eq(webhookEvents.id, event.id));
  }

  return NextResponse.json({ received: true });
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Deja rastro de eventos rechazados: casi siempre es un APP_SECRET mal puesto. */
async function logEvent(
  channel: Channel | null,
  signatureOk: boolean,
  payload: Record<string, any>,
  error?: string
) {
  await db
    .insert(webhookEvents)
    .values({ channel, signatureOk, payload, error: error ?? null })
    .catch(() => {});
}

function safeParse(raw: string): Record<string, any> {
  try {
    return JSON.parse(raw);
  } catch {
    return { _unparsed: raw.slice(0, 2000) };
  }
}

/** HMAC-SHA256 del cuerpo crudo con el APP_SECRET. Comparación en tiempo constante. */
function verifySignature(raw: string, signature: string | null): boolean {
  if (!env.META_APP_SECRET) {
    console.warn("[webhook] META_APP_SECRET sin configurar: se rechaza todo.");
    return false;
  }
  if (!signature?.startsWith("sha256=")) return false;

  const expected = crypto
    .createHmac("sha256", env.META_APP_SECRET)
    .update(raw, "utf8")
    .digest("hex");

  const received = signature.slice("sha256=".length);

  if (received.length !== expected.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(received, "hex"),
    Buffer.from(expected, "hex")
  );
}

function detectChannel(body: Record<string, any>): Channel | null {
  switch (body?.object) {
    case "whatsapp_business_account":
      return "whatsapp";
    case "page":
      return "messenger";
    case "instagram":
      return "instagram";
    default:
      return null;
  }
}

async function process(body: Record<string, any>): Promise<void> {
  const entries: any[] = body?.entry ?? [];

  for (const entry of entries) {
    // --- WhatsApp Cloud API ---
    if (body.object === "whatsapp_business_account") {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};

        for (const msg of parseWhatsAppEntry(value)) {
          await ingestInbound(msg);
          // Palomita azul: confirma recepción al cliente.
          void markAsRead(msg.externalMessageId);
        }

        for (const status of parseWhatsAppStatuses(value)) {
          await ingestStatus(status);
        }
      }
      continue;
    }

    // --- Messenger e Instagram (mismo formato) ---
    const channel: "messenger" | "instagram" =
      body.object === "instagram" ? "instagram" : "messenger";

    const events = entry.messaging ?? entry.standby ?? [];
    for (const msg of parseMessagingEvents(events, channel)) {
      await ingestInbound(msg);
    }
  }
}
