"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Plus } from "lucide-react";
import { formatDateTime, formatMoney, timeAgo } from "@/lib/utils";

interface PanelData {
  contact: {
    id: number;
    name: string | null;
    phone: string | null;
    email: string | null;
    company: string | null;
    location: string | null;
    source: string | null;
    optedOut: boolean;
    createdAt: string;
  };
  leads: Array<{
    lead: { id: number; title: string; valueCents: number; status: string };
    stage: { name: string };
  }>;
  tasks: Array<{ id: number; title: string; dueAt: string; done: boolean }>;
  timeline: Array<{ id: number; type: string; summary: string | null; createdAt: string }>;
  policy: { allowed: boolean; mode?: string; reason?: string; windowHoursLeft: number };
}

/** Ficha CRM del contacto, a la derecha del hilo. */
export function ContactPanel({ conversationId }: { conversationId: number }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/conversations/${conversationId}`);
    if (res.ok) setData(await res.json());
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createLead() {
    if (!data || !title.trim()) return;
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: data.contact.id,
        title,
        valueCents: Math.round(Number(value || 0) * 100),
      }),
    });
    setTitle("");
    setValue("");
    setCreating(false);
    load();
  }

  if (!data) {
    return <aside className="hidden w-72 shrink-0 border-l border-[--color-border] xl:block" />;
  }

  const { contact, leads, tasks, timeline } = data;

  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-[--color-border] bg-[--color-surface] p-4 xl:block">
      <h2 className="text-sm font-semibold">{contact.name ?? "Sin nombre"}</h2>
      <p className="text-xs text-[--color-muted]">{contact.phone ?? "—"}</p>

      {contact.optedOut && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-400">
          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Pidió no recibir mensajes. Todo envío está bloqueado.
        </div>
      )}

      <dl className="mt-4 space-y-2 text-xs">
        <Row label="Origen" value={contact.source} />
        <Row label="Empresa" value={contact.company} />
        <Row label="Ubicación" value={contact.location} />
        <Row label="Email" value={contact.email} />
        <Row label="Alta" value={formatDateTime(contact.createdAt)} />
      </dl>

      {/* Oportunidades */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase text-[--color-muted]">
            Oportunidades
          </h3>
          <button
            onClick={() => setCreating((v) => !v)}
            className="rounded p-1 text-[--color-muted] hover:bg-black/5 dark:hover:bg-white/5"
            title="Nueva oportunidad"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {creating && (
          <div className="mt-2 space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Concepto"
              className="w-full rounded border border-[--color-border] bg-transparent px-2 py-1 text-xs outline-none"
            />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Monto"
              type="number"
              className="w-full rounded border border-[--color-border] bg-transparent px-2 py-1 text-xs outline-none"
            />
            <button
              onClick={createLead}
              className="w-full rounded bg-[--color-brand] py-1 text-xs text-white"
            >
              Crear
            </button>
          </div>
        )}

        <ul className="mt-2 space-y-1">
          {leads.length === 0 && (
            <li className="text-xs text-[--color-muted]">Sin oportunidades</li>
          )}
          {leads.map(({ lead, stage }) => (
            <li
              key={lead.id}
              className="rounded-lg border border-[--color-border] p-2 text-xs"
            >
              <div className="flex justify-between gap-2">
                <span className="truncate font-medium">{lead.title}</span>
                <span className="shrink-0">{formatMoney(lead.valueCents)}</span>
              </div>
              <span className="text-[--color-muted]">{stage.name}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Tareas */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase text-[--color-muted]">
          Tareas
        </h3>
        <ul className="mt-2 space-y-1 text-xs">
          {tasks.filter((t) => !t.done).length === 0 && (
            <li className="text-[--color-muted]">Sin pendientes</li>
          )}
          {tasks
            .filter((t) => !t.done)
            .map((t) => (
              <li key={t.id} className="flex justify-between gap-2">
                <span className="truncate">{t.title}</span>
                <span className="shrink-0 text-[--color-muted]">
                  {formatDateTime(t.dueAt)}
                </span>
              </li>
            ))}
        </ul>
      </div>

      {/* Línea de tiempo */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase text-[--color-muted]">
          Actividad
        </h3>
        <ul className="mt-2 space-y-2 text-xs">
          {timeline.slice(0, 15).map((a) => (
            <li key={a.id} className="border-l border-[--color-border] pl-2">
              <p className="truncate">{a.summary ?? a.type}</p>
              <span className="text-[10px] text-[--color-muted]">
                {timeAgo(a.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-[--color-muted]">{label}</dt>
      <dd className="truncate">{value || "—"}</dd>
    </div>
  );
}
