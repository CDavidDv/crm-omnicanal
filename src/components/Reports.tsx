"use client";

import { useEffect, useState } from "react";
import { cn, formatMoney, CHANNEL_STYLE } from "@/lib/utils";

interface Metrics {
  pipeline: Array<{ id: number; name: string; leads: number; value_cents: string }>;
  canales: Array<{ channel: string; conversations: number; open: number }>;
  embudo: {
    abiertos: number;
    ganados: number;
    perdidos: number;
    ganadoCents: number;
    ganadoMesCents: number;
    conversion: number;
  };
  mensajesPorDia: Array<{ dia: string; entrantes: number; salientes: number }>;
  salud: {
    contactos: number;
    optOuts: number;
    optOutRate: number;
    nuevos30d: number;
    fallidos7d: number;
  };
}

export function Reports() {
  const [m, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMetrics)
      .catch(() => {});
  }, []);

  if (!m) {
    return (
      <div className="p-6 text-sm text-[--color-muted]">Cargando métricas…</div>
    );
  }

  const maxDaily = Math.max(
    1,
    ...m.mensajesPorDia.map((d) => d.entrantes + d.salientes)
  );

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="text-sm font-semibold">Reportes</h1>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ganado este mes" value={formatMoney(m.embudo.ganadoMesCents)} />
        <Kpi label="Ganado total" value={formatMoney(m.embudo.ganadoCents)} />
        <Kpi label="Conversión" value={`${m.embudo.conversion}%`} />
        <Kpi label="Oportunidades abiertas" value={String(m.embudo.abiertos)} />
        <Kpi label="Contactos" value={String(m.salud.contactos)} />
        <Kpi label="Nuevos (30 días)" value={String(m.salud.nuevos30d)} />
        <Kpi
          label="Bajas (opt-out)"
          value={`${m.salud.optOuts} · ${m.salud.optOutRate}%`}
          // Señal anti-ban: arriba de 2% conviene revisar contenido y segmentación.
          warn={m.salud.optOutRate > 2}
        />
        <Kpi
          label="Envíos fallidos (7 días)"
          value={String(m.salud.fallidos7d)}
          warn={m.salud.fallidos7d > 0}
        />
      </div>

      {/* Pipeline */}
      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase text-[--color-muted]">
          Pipeline por etapa
        </h2>
        <div className="mt-2 space-y-2">
          {m.pipeline.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm"
            >
              <span>{s.name}</span>
              <span className="text-[--color-muted]">
                {s.leads} · {formatMoney(Number(s.value_cents))}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Canales */}
      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase text-[--color-muted]">
          Conversaciones por canal
        </h2>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {m.canales.map((c) => (
            <div
              key={c.channel}
              className="rounded-lg border border-[--color-border] bg-[--color-surface] p-3"
            >
              <span
                className={cn(
                  "inline-block rounded-full px-2 py-0.5 text-[10px]",
                  CHANNEL_STYLE[c.channel]?.badge
                )}
              >
                {CHANNEL_STYLE[c.channel]?.label ?? c.channel}
              </span>
              <p className="mt-2 text-xl font-semibold">{c.conversations}</p>
              <p className="text-xs text-[--color-muted]">{c.open} abiertas</p>
            </div>
          ))}
          {m.canales.length === 0 && (
            <p className="text-sm text-[--color-muted]">Sin datos todavía.</p>
          )}
        </div>
      </section>

      {/* Volumen */}
      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase text-[--color-muted]">
          Mensajes (14 días)
        </h2>
        <div className="mt-2 flex h-32 items-end gap-1 rounded-lg border border-[--color-border] bg-[--color-surface] p-3">
          {m.mensajesPorDia.map((d) => (
            <div
              key={d.dia}
              className="flex flex-1 flex-col justify-end gap-0.5"
              title={`${d.dia}: ${d.entrantes} in / ${d.salientes} out`}
            >
              <div
                className="rounded-t bg-[--color-brand]"
                style={{ height: `${(d.salientes / maxDaily) * 100}%` }}
              />
              <div
                className="rounded-b bg-emerald-500"
                style={{ height: `${(d.entrantes / maxDaily) * 100}%` }}
              />
            </div>
          ))}
          {m.mensajesPorDia.length === 0 && (
            <p className="text-sm text-[--color-muted]">Sin mensajes aún.</p>
          )}
        </div>
        <p className="mt-1 text-[10px] text-[--color-muted]">
          Verde: entrantes · Azul: salientes
        </p>
      </section>

      <a
        href="/api/export/contacts"
        className="mt-6 inline-block rounded-lg border border-[--color-border] px-3 py-2 text-xs hover:bg-black/5 dark:hover:bg-white/5"
      >
        Exportar contactos a CSV
      </a>
    </div>
  );
}

function Kpi({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-[--color-surface] p-3",
        warn ? "border-amber-500/50" : "border-[--color-border]"
      )}
    >
      <p className="text-xs text-[--color-muted]">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", warn && "text-amber-600")}>
        {value}
      </p>
    </div>
  );
}
