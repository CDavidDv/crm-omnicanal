import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { activities, tasks } from "@/lib/db/schema";

const patchSchema = z.object({
  done: z.boolean().optional(),
  title: z.string().min(1).optional(),
  dueAt: z.string().datetime().optional(),
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
  if (parsed.data.dueAt) updates.dueAt = new Date(parsed.data.dueAt);
  if (parsed.data.done !== undefined) {
    updates.done = parsed.data.done;
    updates.doneAt = parsed.data.done ? new Date() : null;
  }

  const [task] = await db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, Number(id)))
    .returning();

  if (parsed.data.done && task?.contactId) {
    await db.insert(activities).values({
      contactId: task.contactId,
      leadId: task.leadId,
      type: "task_done",
      summary: task.title,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(tasks).where(eq(tasks.id, Number(id)));
  return NextResponse.json({ ok: true });
}
