import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { activities, leads, stages } from "@/lib/db/schema";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  valueCents: z.number().int().min(0).optional(),
  stageId: z.number().int().positive().optional(),
  status: z.enum(["open", "won", "lost"]).optional(),
  lostReason: z.string().nullable().optional(),
  ownerEmail: z.string().nullable().optional(),
  nextActionAt: z.string().datetime().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const leadId = Number(id);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const current = (
    await db.select().from(leads).where(eq(leads.id, leadId)).limit(1)
  )[0];

  if (!current) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) updates[k] = k === "nextActionAt" && v ? new Date(v as string) : v;
  }

  // Mover a una etapa marcada ganada/perdida cierra el lead automáticamente.
  if (data.stageId && data.stageId !== current.stageId) {
    const [stage] = await db
      .select()
      .from(stages)
      .where(eq(stages.id, data.stageId))
      .limit(1);

    if (stage?.isWon) {
      updates.status = "won";
      updates.closedAt = new Date();
    } else if (stage?.isLost) {
      updates.status = "lost";
      updates.closedAt = new Date();
    } else {
      updates.status = "open";
      updates.closedAt = null;
    }

    await db.insert(activities).values({
      contactId: current.contactId,
      leadId,
      type:
        stage?.isWon ? "lead_won" : stage?.isLost ? "lead_lost" : "stage_changed",
      summary: `Movido a ${stage?.name ?? "etapa desconocida"}`,
    });
  }

  await db.update(leads).set(updates).where(eq(leads.id, leadId));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(leads).where(eq(leads.id, Number(id)));
  return NextResponse.json({ ok: true });
}
