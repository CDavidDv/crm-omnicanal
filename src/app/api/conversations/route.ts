import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, conversations, channelEnum } from "@/lib/db/schema";
import { windowRemainingHours } from "@/lib/channels/policy";

/** Bandeja unificada. Filtros: ?channel=whatsapp&status=open&q=texto */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const channel = url.searchParams.get("channel");
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim();

  const filters: SQL[] = [];

  if (channel && channelEnum.enumValues.includes(channel as never)) {
    filters.push(eq(conversations.channel, channel as never));
  }
  if (status === "open" || status === "pending" || status === "closed") {
    filters.push(eq(conversations.status, status));
  }
  if (q) {
    const like = `%${q}%`;
    filters.push(
      or(
        ilike(contacts.name, like),
        ilike(contacts.phone, like),
        ilike(conversations.lastMessagePreview, like)
      )!
    );
  }

  const rows = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      lastInboundAt: conversations.lastInboundAt,
      lastMessagePreview: conversations.lastMessagePreview,
      unreadCount: conversations.unreadCount,
      contactId: contacts.id,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      avatarUrl: contacts.avatarUrl,
      optedOut: contacts.optedOut,
    })
    .from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      // La UI muestra cuánto queda de ventana libre de 24 h.
      windowHoursLeft: windowRemainingHours(r.lastInboundAt),
    }))
  );
}
