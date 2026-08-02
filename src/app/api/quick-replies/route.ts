import { NextResponse } from "next/server";
import { asc, isNull, or, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { quickReplies } from "@/lib/db/schema";

/**
 * Respuestas rápidas del equipo. Es texto local que el vendedor inserta en el
 * compositor: no sustituye a las plantillas de Meta ni habilita enviar fuera de
 * la ventana de 24 h (eso lo sigue decidiendo la policy).
 */

/** ?channel=whatsapp devuelve las de ese canal más las genéricas. */
export async function GET(request: Request) {
  const channel = new URL(request.url).searchParams.get("channel");

  const rows = await db
    .select()
    .from(quickReplies)
    .where(
      channel === "whatsapp" || channel === "messenger" || channel === "instagram"
        ? or(isNull(quickReplies.channel), eq(quickReplies.channel, channel))
        : undefined
    )
    .orderBy(asc(quickReplies.position), asc(quickReplies.id))
    .limit(200);

  return NextResponse.json(rows);
}

const createSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(4000),
  channel: z.enum(["whatsapp", "messenger", "instagram"]).nullish(),
  position: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const [row] = await db
    .insert(quickReplies)
    .values({
      title: parsed.data.title,
      body: parsed.data.body,
      channel: parsed.data.channel ?? null,
      position: parsed.data.position ?? 0,
    })
    .returning();

  return NextResponse.json(row);
}
