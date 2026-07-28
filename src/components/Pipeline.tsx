"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney, cn, CHANNEL_STYLE } from "@/lib/utils";

interface Stage {
  id: number;
  key: string;
  name: string;
  position: number;
  color: string;
  isWon: boolean;
  isLost: boolean;
}

interface LeadRow {
  lead: {
    id: number;
    title: string;
    valueCents: number;
    stageId: number;
    status: string;
    channel: string | null;
  };
  contactName: string | null;
  contactPhone: string | null;
}

/** Kanban con arrastrar y soltar nativo (sin librerías extra). */
export function Pipeline() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/leads");
    if (!res.ok) return;
    const data = await res.json();
    setStages(data.stages);
    setLeads(data.leads);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function move(leadId: number, stageId: number) {
    // Optimista: la tarjeta se mueve ya, el servidor confirma después.
    setLeads((prev) =>
      prev.map((r) =>
        r.lead.id === leadId ? { ...r, lead: { ...r.lead, stageId } } : r
      )
    );

    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });

    load();
  }

  const total = leads
    .filter((r) => r.lead.status === "open")
    .reduce((sum, r) => sum + r.lead.valueCents, 0);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[--color-border] bg-[--color-surface] px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold">Pipeline de ventas</h1>
          <p className="text-xs text-[--color-muted]">
            {leads.length} oportunidades · {formatMoney(total)} en juego
          </p>
        </div>
        <a
          href="/api/export/contacts"
          className="rounded-lg border border-[--color-border] px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5"
        >
          Exportar CSV
        </a>
      </header>

      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {stages.map((stage) => {
          const stageLeads = leads.filter((r) => r.lead.stageId === stage.id);
          const stageTotal = stageLeads.reduce(
            (s, r) => s + r.lead.valueCents,
            0
          );

          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage.id);
              }}
              onDragLeave={() => setOverStage(null)}
              onDrop={() => {
                if (dragId) move(dragId, stage.id);
                setDragId(null);
                setOverStage(null);
              }}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl border bg-[--color-surface] transition-colors",
                overStage === stage.id
                  ? "border-[--color-brand]"
                  : "border-[--color-border]"
              )}
            >
              <div className="border-b border-[--color-border] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{stage.name}</span>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
                    {stageLeads.length}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[--color-muted]">
                  {formatMoney(stageTotal)}
                </p>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {stageLeads.length === 0 && (
                  <p className="py-6 text-center text-xs text-[--color-muted]">
                    Vacío
                  </p>
                )}

                {stageLeads.map(({ lead, contactName, contactPhone }) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => setDragId(lead.id)}
                    onDragEnd={() => setDragId(null)}
                    className={cn(
                      "cursor-grab rounded-lg border border-[--color-border] bg-[--color-bg] p-2.5 text-xs active:cursor-grabbing",
                      dragId === lead.id && "opacity-40"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{lead.title}</span>
                      <span className="shrink-0 text-emerald-600">
                        {formatMoney(lead.valueCents)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[--color-muted]">
                      {contactName || contactPhone || "Sin contacto"}
                    </p>
                    {lead.channel && (
                      <span
                        className={cn(
                          "mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px]",
                          CHANNEL_STYLE[lead.channel]?.badge
                        )}
                      >
                        {CHANNEL_STYLE[lead.channel]?.label}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {stages.length === 0 && (
          <p className="text-sm text-[--color-muted]">
            No hay etapas. Corre <code>npm run db:seed</code>.
          </p>
        )}
      </div>
    </div>
  );
}
