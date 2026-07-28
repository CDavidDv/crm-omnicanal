import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { sendOutbound } from "@/lib/messaging/send";
import { getSession } from "@/lib/auth/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversationId = Number(id);

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(500);

  // Al abrir la conversación se marca como leída en el CRM.
  await db
    .update(conversations)
    .set({ unreadCount: 0 })
    .where(eq(conversations.id, conversationId));

  return NextResponse.json(rows);
}

const sendSchema = z.object({
  text: z.string().min(1).max(4000),
  template: z
    .object({
      name: z.string(),
      language: z.string().default("es_MX"),
      params: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const result = await sendOutbound({
    conversationId: Number(id),
    text: parsed.data.text,
    template: parsed.data.template,
    author: `agent:${session?.email ?? "desconocido"}`,
  });

  if (!result.ok) {
    // 422: la policy anti-ban o Meta rechazaron. No es un error del servidor.
    return NextResponse.json(
      { error: result.reason, needsTemplate: result.needsTemplate ?? false },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, messageId: result.messageId });
}
