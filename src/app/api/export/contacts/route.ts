import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, leads, stages } from "@/lib/db/schema";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export CSV compatible con Excel (BOM + separador ;). */
export async function GET() {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      phone: contacts.phone,
      email: contacts.email,
      company: contacts.company,
      location: contacts.location,
      source: contacts.source,
      owner: contacts.ownerEmail,
      optedOut: contacts.optedOut,
      createdAt: contacts.createdAt,
      leadTitle: leads.title,
      leadValue: leads.valueCents,
      leadStatus: leads.status,
      stageName: stages.name,
    })
    .from(contacts)
    .leftJoin(leads, eq(leads.contactId, contacts.id))
    .leftJoin(stages, eq(leads.stageId, stages.id))
    .orderBy(desc(contacts.createdAt))
    .limit(10000);

  const header = [
    "id",
    "nombre",
    "telefono",
    "email",
    "empresa",
    "ubicacion",
    "origen",
    "responsable",
    "opt_out",
    "creado",
    "oportunidad",
    "valor",
    "estado_oportunidad",
    "etapa",
  ];

  const body = rows.map((r) =>
    [
      r.id,
      r.name,
      r.phone,
      r.email,
      r.company,
      r.location,
      r.source,
      r.owner,
      r.optedOut ? "si" : "no",
      r.createdAt?.toISOString().slice(0, 10),
      r.leadTitle,
      r.leadValue != null ? (r.leadValue / 100).toFixed(2) : "",
      r.leadStatus,
      r.stageName,
    ]
      .map(csvCell)
      .join(";")
  );

  const csv = "﻿" + [header.join(";"), ...body].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contactos-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
