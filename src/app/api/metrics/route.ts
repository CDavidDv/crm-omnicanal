import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Métricas del tablero. Incluye a propósito la tasa de opt-out: es la alerta
 * temprana de problemas de calidad ante Meta (ver docs/ANTI-BAN.md).
 */
export async function GET() {
  const [byStage, byChannel, funnel, daily, health] = await Promise.all([
    db.execute(sql`
      select s.id, s.name, s.color, s.position,
             count(l.id)::int as leads,
             coalesce(sum(l.value_cents), 0)::bigint as value_cents
      from stages s
      left join leads l on l.stage_id = s.id and l.status = 'open'
      group by s.id, s.name, s.color, s.position
      order by s.position
    `),

    db.execute(sql`
      select channel,
             count(*)::int as conversations,
             count(*) filter (where status = 'open')::int as open
      from conversations
      group by channel
    `),

    db.execute(sql`
      select
        count(*) filter (where status = 'open')::int   as abiertos,
        count(*) filter (where status = 'won')::int    as ganados,
        count(*) filter (where status = 'lost')::int   as perdidos,
        coalesce(sum(value_cents) filter (where status = 'won'), 0)::bigint as ganado_cents,
        coalesce(sum(value_cents) filter (
          where status = 'won' and closed_at >= date_trunc('month', now())
        ), 0)::bigint as ganado_mes_cents
      from leads
    `),

    db.execute(sql`
      select date_trunc('day', m.created_at)::date as dia,
             count(*) filter (where direction = 'inbound')::int  as entrantes,
             count(*) filter (where direction = 'outbound')::int as salientes
      from messages m
      where m.created_at >= now() - interval '14 days'
      group by 1
      order by 1
    `),

    db.execute(sql`
      select
        (select count(*) from contacts)::int as contactos,
        (select count(*) from contacts where opted_out)::int as opt_outs,
        (select count(*) from contacts where created_at >= now() - interval '30 days')::int as nuevos_30d,
        (select count(*) from messages where status = 'failed' and created_at >= now() - interval '7 days')::int as fallidos_7d
    `),
  ]);

  const f = (funnel as unknown as any[])[0] ?? {};
  const h = (health as unknown as any[])[0] ?? {};

  const ganados = Number(f.ganados ?? 0);
  const perdidos = Number(f.perdidos ?? 0);
  const cerrados = ganados + perdidos;

  return NextResponse.json({
    pipeline: byStage,
    canales: byChannel,
    embudo: {
      abiertos: Number(f.abiertos ?? 0),
      ganados,
      perdidos,
      ganadoCents: Number(f.ganado_cents ?? 0),
      ganadoMesCents: Number(f.ganado_mes_cents ?? 0),
      conversion: cerrados > 0 ? Math.round((ganados / cerrados) * 100) : 0,
    },
    mensajesPorDia: daily,
    salud: {
      contactos: Number(h.contactos ?? 0),
      optOuts: Number(h.opt_outs ?? 0),
      // Sobre 2% conviene revisar segmentación y contenido antes de que Meta actúe.
      optOutRate:
        Number(h.contactos ?? 0) > 0
          ? Number((((h.opt_outs ?? 0) / h.contactos) * 100).toFixed(2))
          : 0,
      nuevos30d: Number(h.nuevos_30d ?? 0),
      fallidos7d: Number(h.fallidos_7d ?? 0),
    },
  });
}
