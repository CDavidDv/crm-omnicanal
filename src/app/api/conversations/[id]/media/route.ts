import { NextResponse } from "next/server";
import { sendOutboundMedia } from "@/lib/messaging/send";
import { getSession } from "@/lib/auth/session";
import type { MediaKind } from "@/lib/channels/types";

/**
 * Envío de adjuntos. El archivo va directo a Meta: el CRM no lo guarda en
 * disco, así que sigue funcionando en despliegues sin volumen persistente.
 */

/** Límites de WhatsApp Cloud API. Rechazar aquí evita un 400 de Meta. */
const MAX_BYTES: Record<MediaKind, number> = {
  image: 5 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  const kind = kindFromMime(mime);

  if (file.size > MAX_BYTES[kind]) {
    const mb = Math.round(MAX_BYTES[kind] / (1024 * 1024));
    return NextResponse.json(
      { error: `El archivo supera el límite de ${mb} MB para ${kind} en WhatsApp.` },
      { status: 413 }
    );
  }

  const caption = form?.get("caption");

  const result = await sendOutboundMedia({
    conversationId: Number(id),
    kind,
    data: new Uint8Array(await file.arrayBuffer()),
    mime,
    filename: file.name || `adjunto.${kind}`,
    caption: typeof caption === "string" && caption.trim() ? caption.trim() : undefined,
    author: `agent:${session?.email ?? "desconocido"}`,
  });

  if (!result.ok) {
    // 422: lo frenó la policy anti-ban o Meta, no un fallo del servidor.
    return NextResponse.json(
      { error: result.reason, needsTemplate: result.needsTemplate ?? false },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, messageId: result.messageId });
}
