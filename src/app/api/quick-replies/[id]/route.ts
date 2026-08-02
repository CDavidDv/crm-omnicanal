import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { quickReplies } from "@/lib/db/schema";

const patchSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  body: z.string().min(1).max(4000).optional(),
  channel: z.enum(["whatsapp", "messenger", "instagram"]).nullish(),
  position: z.number().int().min(0).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title) updates.title = parsed.data.title;
  if (parsed.data.body) updates.body = parsed.data.body;
  if (parsed.data.position !== undefined) updates.position = parsed.data.position;
  // null es un valor válido: significa "disponible en los tres canales".
  if (parsed.data.channel !== undefined) updates.channel = parsed.data.channel ?? null;

  const [row] = await db
    .update(quickReplies)
    .set(updates)
    .where(eq(quickReplies.id, Number(id)))
    .returning();

  return NextResponse.json(row ?? { error: "No encontrada" });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(quickReplies).where(eq(quickReplies.id, Number(id)));
  return NextResponse.json({ ok: true });
}
