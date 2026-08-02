import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  activities,
  channelIdentities,
  contacts,
  conversations,
  leads,
  stages,
  tasks,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contactId = Number(id);

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) {
    return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  }

  const [identities, contactLeads, contactTasks, timeline, convs] = await Promise.all([
    db
      .select()
      .from(channelIdentities)
      .where(eq(channelIdentities.contactId, contactId)),
    db
      .select({ lead: leads, stage: stages })
      .from(leads)
      .innerJoin(stages, eq(leads.stageId, stages.id))
      .where(eq(leads.contactId, contactId))
      .orderBy(desc(leads.createdAt)),
    db
      .select()
      .from(tasks)
      .where(eq(tasks.contactId, contactId))
      .orderBy(desc(tasks.dueAt))
      .limit(50),
    db
      .select()
      .from(activities)
      .where(eq(activities.contactId, contactId))
      .orderBy(desc(activities.createdAt))
      .limit(50),
    db
      .select({
        id: conversations.id,
        channel: conversations.channel,
        lastMessageAt: conversations.lastMessageAt,
        lastMessagePreview: conversations.lastMessagePreview,
      })
      .from(conversations)
      .where(eq(conversations.contactId, contactId))
      .orderBy(desc(conversations.lastMessageAt)),
  ]);

  return NextResponse.json({
    contact,
    identities,
    leads: contactLeads,
    tasks: contactTasks,
    timeline,
    conversations: convs,
  });
}

const patchSchema = z.object({
  name: z.string().max(160).nullish(),
  email: z.string().max(160).nullish(),
  phone: z.string().max(40).nullish(),
  company: z.string().max(160).nullish(),
  location: z.string().max(160).nullish(),
  notes: z.string().max(4000).nullish(),
  source: z.string().max(80).nullish(),
  /**
   * Se puede marcar de baja a mano, y también revertirlo: a veces el contacto
   * vuelve a escribir pidiendo información. La policy lee este campo antes de
   * cada envío, así que apagarlo es reactivar los envíos — con consentimiento.
   */
  optedOut: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contactId = Number(id);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  for (const key of [
    "name",
    "email",
    "phone",
    "company",
    "location",
    "notes",
    "source",
  ] as const) {
    if (parsed.data[key] !== undefined) updates[key] = parsed.data[key] || null;
  }

  if (parsed.data.optedOut !== undefined) {
    updates.optedOut = parsed.data.optedOut;
    updates.optedOutAt = parsed.data.optedOut ? new Date() : null;
  }

  const [row] = await db
    .update(contacts)
    .set(updates)
    .where(eq(contacts.id, contactId))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  }

  // La baja y el alta quedan en la línea de tiempo: es la trazabilidad que
  // respalda el envío si Meta pregunta por qué se le escribió a alguien.
  if (parsed.data.optedOut !== undefined) {
    await db.insert(activities).values({
      contactId,
      type: parsed.data.optedOut ? "opted_out" : "note_added",
      summary: parsed.data.optedOut
        ? "Marcado de baja manualmente: se bloquean todos los envíos"
        : "Baja revertida manualmente: se permiten envíos de nuevo",
    });
  }

  return NextResponse.json(row);
}
