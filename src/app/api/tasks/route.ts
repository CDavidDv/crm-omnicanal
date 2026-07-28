import { NextResponse } from "next/server";
import { and, asc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { activities, contacts, tasks } from "@/lib/db/schema";

/** ?scope=today|overdue|all — alimenta el panel de seguimientos. */
export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") ?? "all";

  const filters = [eq(tasks.done, false)];
  if (scope === "today") {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    filters.push(lte(tasks.dueAt, end));
  } else if (scope === "overdue") {
    filters.push(lte(tasks.dueAt, new Date()));
  }

  const rows = await db
    .select({
      task: tasks,
      contactName: contacts.name,
      contactPhone: contacts.phone,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .where(and(...filters))
    .orderBy(asc(tasks.dueAt))
    .limit(200);

  return NextResponse.json(rows);
}

const createSchema = z.object({
  title: z.string().min(1),
  dueAt: z.string().datetime(),
  contactId: z.number().int().positive().optional(),
  leadId: z.number().int().positive().optional(),
  ownerEmail: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const [task] = await db
    .insert(tasks)
    .values({ ...parsed.data, dueAt: new Date(parsed.data.dueAt) })
    .returning();

  if (task.contactId) {
    await db.insert(activities).values({
      contactId: task.contactId,
      leadId: task.leadId,
      type: "task_created",
      summary: task.title,
    });
  }

  return NextResponse.json(task);
}
