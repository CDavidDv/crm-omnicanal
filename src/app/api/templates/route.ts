import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/channels/whatsapp";

/**
 * Plantillas aprobadas de WhatsApp. Es lo único que Meta permite enviar con la
 * ventana de 24 h cerrada, así que la bandeja las pide al bloquearse el envío
 * libre. Solo lectura: el alta y la aprobación se hacen en Meta Business.
 */
export async function GET() {
  const result = await listTemplates();

  if (!result.ok) {
    return NextResponse.json({ error: result.error, templates: [] }, { status: 200 });
  }

  return NextResponse.json({ templates: result.templates });
}
