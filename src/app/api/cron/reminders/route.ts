import { NextResponse } from "next/server";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, tasks } from "@/lib/db/schema";
import { env } from "@/lib/env";

/**
 * Recordatorio de tareas vencidas. Pensado para un cron externo:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://tu-crm/api/cron/reminders
 *
 * No manda nada a los contactos a propósito: un recordatorio interno que se
 * convierte en mensaje saliente automático es justo lo que rompe la ventana de
 * 24 h. El resumen va al equipo (REMINDERS_WEBHOOK_URL) o en la respuesta.
 */

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  if (!env.CRON_SECRET) return false;
  const header =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-cron-secret");
  return header === env.CRON_SECRET;
}

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Falta CRON_SECRET: la ruta está deshabilitada." },
      { status: 503 }
    );
  }

  if (!authorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const now = new Date();

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      ownerEmail: tasks.ownerEmail,
      contactName: contacts.name,
      contactPhone: contacts.phone,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .where(and(eq(tasks.done, false), lte(tasks.dueAt, now)))
    .orderBy(asc(tasks.dueAt))
    .limit(200);

  // Agrupado por responsable: cada vendedor recibe solo lo suyo.
  const byOwner = new Map<string, typeof rows>();
  for (const row of rows) {
    const owner = row.ownerEmail ?? "sin asignar";
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), row]);
  }

  const summary = [...byOwner.entries()].map(([owner, items]) => ({
    owner,
    count: items.length,
    tasks: items.map((t) => ({
      id: t.id,
      title: t.title,
      dueAt: t.dueAt,
      contact: t.contactName ?? t.contactPhone ?? "sin contacto",
    })),
  }));

  let notified = false;

  if (rows.length > 0 && env.REMINDERS_WEBHOOK_URL) {
    const text = [
      `⏰ ${rows.length} tarea(s) vencida(s) en el CRM`,
      ...summary.map(
        (g) =>
          `• ${g.owner}: ${g.count} — ${g.tasks
            .slice(0, 5)
            .map((t) => t.title)
            .join(", ")}${g.count > 5 ? "…" : ""}`
      ),
    ].join("\n");

    // Formato `text`: lo entienden Slack, Discord y la mayoría de webhooks.
    const res = await fetch(env.REMINDERS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content: text }),
    }).catch(() => null);

    notified = Boolean(res?.ok);
  }

  return NextResponse.json({
    ranAt: now.toISOString(),
    overdue: rows.length,
    notified,
    summary,
  });
}
