import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  activities,
  contacts,
  conversations,
  leads,
  notes,
  stages,
  tasks,
} from "@/lib/db/schema";
import { canSend, windowRemainingHours } from "@/lib/channels/policy";

/** Conversación + ficha CRM completa del contacto (panel lateral). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rows = await db
    .select({ conv: conversations, contact: contacts })
    .from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(eq(conversations.id, Number(id)))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  const { conv, contact } = rows[0];

  const [contactLeads, contactTasks, contactNotes, timeline] = await Promise.all([
    db
      .select({ lead: leads, stage: stages })
      .from(leads)
      .innerJoin(stages, eq(leads.stageId, stages.id))
      .where(eq(leads.contactId, contact.id))
      .orderBy(desc(leads.updatedAt)),
    db
      .select()
      .from(tasks)
      .where(eq(tasks.contactId, contact.id))
      .orderBy(desc(tasks.dueAt)),
    db
      .select()
      .from(notes)
      .where(eq(notes.contactId, contact.id))
      .orderBy(desc(notes.createdAt)),
    db
      .select()
      .from(activities)
      .where(eq(activities.contactId, contact.id))
      .orderBy(desc(activities.createdAt))
      .limit(50),
  ]);

  return NextResponse.json({
    conversation: conv,
    contact,
    leads: contactLeads,
    tasks: contactTasks,
    notes: contactNotes,
    timeline,
    policy: {
      ...canSend({
        channel: conv.channel,
        optedOut: contact.optedOut,
        lastInboundAt: conv.lastInboundAt,
      }),
      windowHoursLeft: windowRemainingHours(conv.lastInboundAt),
    },
  });
}

const patchSchema = z.object({
  status: z.enum(["open", "pending", "closed"]).optional(),
  assignedTo: z.string().nullable().optional(),
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

  await db
    .update(conversations)
    .set(parsed.data)
    .where(eq(conversations.id, Number(id)));

  return NextResponse.json({ ok: true });
}
