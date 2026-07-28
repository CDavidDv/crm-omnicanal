import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { activities, contacts, leads, stages } from "@/lib/db/schema";

/** Pipeline completo: leads + etapas, para el kanban. */
export async function GET() {
  const [allStages, rows] = await Promise.all([
    db.select().from(stages).orderBy(stages.position),
    db
      .select({
        lead: leads,
        contactName: contacts.name,
        contactPhone: contacts.phone,
        avatarUrl: contacts.avatarUrl,
      })
      .from(leads)
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .orderBy(desc(leads.updatedAt))
      .limit(500),
  ]);

  return NextResponse.json({ stages: allStages, leads: rows });
}

const createSchema = z.object({
  contactId: z.number().int().positive(),
  title: z.string().min(1),
  valueCents: z.number().int().min(0).default(0),
  stageId: z.number().int().positive().optional(),
  source: z.string().optional(),
  ownerEmail: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Sin etapa explícita: la primera del pipeline.
  const stageId =
    parsed.data.stageId ??
    (await db.select().from(stages).orderBy(stages.position).limit(1))[0]?.id;

  if (!stageId) {
    return NextResponse.json(
      { error: "No hay etapas configuradas. Corre npm run db:seed" },
      { status: 400 }
    );
  }

  const [lead] = await db
    .insert(leads)
    .values({ ...parsed.data, stageId })
    .returning();

  await db.insert(activities).values({
    contactId: parsed.data.contactId,
    leadId: lead.id,
    type: "lead_created",
    summary: `Oportunidad creada: ${lead.title}`,
  });

  return NextResponse.json(lead);
}
