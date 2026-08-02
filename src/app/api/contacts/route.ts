import { NextResponse } from "next/server";
import { and, desc, eq, ilike, inArray, max, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { channelIdentities, contacts, conversations, leads } from "@/lib/db/schema";

/**
 * Listado de contactos con búsqueda.
 *
 * Los datos por contacto (canales, oportunidades abiertas, último mensaje) se
 * traen en consultas aparte y se cruzan en memoria, en vez de con subconsultas
 * correlacionadas: la primera versión usaba SQL crudo y devolvía los canales de
 * TODOS los contactos en cada fila. Con el listado acotado a 300 filas, cuatro
 * consultas simples salen más baratas que un bug silencioso.
 *
 * Los canales salen de `channel_identities`, nunca de `phone`: en Instagram y
 * Messenger no hay teléfono.
 */

export const dynamic = "force-dynamic";

const LIMIT = 300;

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
      inArray(
        contacts.id,
        db
          .select({ id: channelIdentities.contactId })
          .from(channelIdentities)
          .where(eq(channelIdentities.channel, channel))
      )
    );
  }

  const rows = await db
    .select()
    .from(contacts)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(contacts.updatedAt))
    .limit(LIMIT);

  if (rows.length === 0) return NextResponse.json([]);

  const ids = rows.map((r) => r.id);

  const [identities, openLeads, lastMessages] = await Promise.all([
    db
      .select({
        contactId: channelIdentities.contactId,
        channel: channelIdentities.channel,
      })
      .from(channelIdentities)
      .where(inArray(channelIdentities.contactId, ids)),
    db
      .select({
        contactId: leads.contactId,
        count: sql<number>`count(*)::int`,
      })
      .from(leads)
      .where(and(inArray(leads.contactId, ids), eq(leads.status, "open")))
      .groupBy(leads.contactId),
    db
      .select({
        contactId: conversations.contactId,
        lastMessageAt: max(conversations.lastMessageAt),
      })
      .from(conversations)
      .where(inArray(conversations.contactId, ids))
      .groupBy(conversations.contactId),
  ]);

  const channelsByContact = new Map<number, Set<string>>();
  for (const i of identities) {
    const set = channelsByContact.get(i.contactId) ?? new Set<string>();
    set.add(i.channel);
    channelsByContact.set(i.contactId, set);
  }

  const leadsByContact = new Map(openLeads.map((l) => [l.contactId, l.count]));
  const lastByContact = new Map(
    lastMessages.map((c) => [c.contactId, c.lastMessageAt])
  );

  return NextResponse.json(
    rows.map((contact) => ({
      contact,
      channels: [...(channelsByContact.get(contact.id) ?? [])].sort(),
      openLeads: leadsByContact.get(contact.id) ?? 0,
      lastMessageAt: lastByContact.get(contact.id) ?? null,
    }))
  );
}
