import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { channelIdentities, contacts, conversations, leads } from "@/lib/db/schema";

/**
 * Listado de contactos con búsqueda. Un contacto puede tener varias identidades
 * de canal, así que los canales se agregan aparte: en Instagram y Messenger no
 * hay teléfono y asumir que `phone` identifica al contacto es justo el error
 * que la tabla `channel_identities` existe para evitar.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const channel = url.searchParams.get("channel");
  const optedOut = url.searchParams.get("optedOut");

  const filters = [];

  if (q) {
    const like = `%${q}%`;
    filters.push(
      or(
        ilike(contacts.name, like),
        ilike(contacts.phone, like),
        ilike(contacts.email, like),
        ilike(contacts.company, like)
      )
    );
  }

  if (optedOut === "true") filters.push(eq(contacts.optedOut, true));

  if (channel === "whatsapp" || channel === "messenger" || channel === "instagram") {
    filters.push(
      sql`exists (
        select 1 from ${channelIdentities}
        where ${channelIdentities.contactId} = ${contacts.id}
          and ${channelIdentities.channel} = ${channel}
      )`
    );
  }

  const rows = await db
    .select({
      contact: contacts,
      channels: sql<string[]>`coalesce(
        array(
          select distinct ${channelIdentities.channel}::text
          from ${channelIdentities}
          where ${channelIdentities.contactId} = ${contacts.id}
        ),
        '{}'
      )`,
      openLeads: sql<number>`(
        select count(*)::int from ${leads}
        where ${leads.contactId} = ${contacts.id} and ${leads.status} = 'open'
      )`,
      lastMessageAt: sql<string | null>`(
        select max(${conversations.lastMessageAt}) from ${conversations}
        where ${conversations.contactId} = ${contacts.id}
      )`,
    })
    .from(contacts)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(contacts.updatedAt))
    .limit(300);

  return NextResponse.json(rows);
}
