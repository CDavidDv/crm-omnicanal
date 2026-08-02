import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { resolveMediaUrl } from "@/lib/channels/whatsapp";
import { channelConfig } from "@/lib/env";

/**
 * Proxy de adjuntos. El navegador nunca habla con Meta:
 *
 * - WhatsApp guarda `wa-media:<id>`. Hay que pedir la URL a Graph y descargarla
 *   con el token; además caduca a los 5 minutos, así que no sirve guardarla.
 * - Messenger e Instagram mandan una URL firmada de fbcdn que también expira.
 *
 * En ambos casos el token jamás sale del servidor. La ruta va detrás del
 * middleware de sesión, igual que el resto de `/api`.
 */

/** Solo se reenvía tráfico a dominios de Meta: evita convertir esto en un SSRF. */
const ALLOWED_HOSTS = [
  "fbcdn.net",
  "cdninstagram.com",
  "facebook.com",
  "fbsbx.com",
  "whatsapp.net",
];

function isMetaHost(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some(
      (h) => url.hostname === h || url.hostname.endsWith(`.${h}`)
    );
  } catch {
    return false;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const messageId = Number(id);

  if (!Number.isInteger(messageId)) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }

  const [row] = await db
    .select({
      mediaUrl: messages.mediaUrl,
      mediaMime: messages.mediaMime,
      type: messages.type,
    })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!row?.mediaUrl) {
    return NextResponse.json({ error: "Sin adjunto" }, { status: 404 });
  }

  let target = row.mediaUrl;
  const headers: Record<string, string> = {};

  if (target.startsWith("wa-media:")) {
    const cfg = channelConfig.whatsapp;
    if (!cfg.enabled) {
      return NextResponse.json(
        { error: "Canal WhatsApp no configurado" },
        { status: 503 }
      );
    }

    const resolved = await resolveMediaUrl(target.slice("wa-media:".length));
    if (!resolved) {
      return NextResponse.json(
        { error: "Meta no devolvió la URL del adjunto (¿caducó?)" },
        { status: 502 }
      );
    }

    target = resolved;
    // La descarga del binario también exige el token, no solo la resolución.
    headers.Authorization = `Bearer ${cfg.token}`;
  }

  if (!isMetaHost(target)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 400 });
  }

  const upstream = await fetch(target, { headers }).catch(() => null);

  if (!upstream?.ok || !upstream.body) {
    return NextResponse.json(
      { error: `No se pudo descargar el adjunto (${upstream?.status ?? "sin respuesta"})` },
      { status: 502 }
    );
  }

  const mime =
    row.mediaMime ??
    upstream.headers.get("content-type") ??
    "application/octet-stream";

  return new Response(upstream.body, {
    headers: {
      "Content-Type": mime,
      // Privado: el adjunto es de un contacto, no debe quedar en caches compartidas.
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition":
        row.type === "document" ? `attachment; filename="adjunto-${messageId}"` : "inline",
      ...(upstream.headers.get("content-length")
        ? { "Content-Length": upstream.headers.get("content-length")! }
        : {}),
    },
  });
}
