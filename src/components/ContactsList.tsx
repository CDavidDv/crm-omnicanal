"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Download, MessageSquare, Search } from "lucide-react";
import { CHANNEL_STYLE, cn, timeAgo } from "@/lib/utils";

interface Row {
  contact: {
    id: number;
    name: string | null;
    phone: string | null;
    email: string | null;
    company: string | null;
    source: string | null;
    optedOut: boolean;
    createdAt: string;
  };
  channels: string[];
  openLeads: number;
  lastMessageAt: string | null;
}

const CHANNEL_FILTERS = [
  { value: "", label: "Todos" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
];

export function ContactsList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [onlyOptedOut, setOnlyOptedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (channel) params.set("channel", channel);
    if (onlyOptedOut) params.set("optedOut", "true");

    const res = await fetch(`/api/contacts?${params}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [q, channel, onlyOptedOut]);

  // Debounce: la búsqueda pega a la DB en cada tecla si no se espera.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[--color-border] bg-[--color-surface] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-sm font-semibold">
              Contactos{" "}
              <span className="font-normal text-[--color-muted]">({rows.length})</span>
            </h1>
            <a
              href="/api/export/contacts"
              className="flex items-center gap-1.5 rounded-lg border border-[--color-border] px-2.5 py-1.5 text-xs text-[--color-muted] hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </a>
          </div>

          <div className="relative mt-2.5">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[--color-muted]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, teléfono, email o empresa…"
              className="w-full rounded-lg border border-[--color-border] bg-transparent py-2 pl-8 pr-3 text-sm outline-none focus:border-[--color-brand]"
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {CHANNEL_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setChannel(f.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs",
                  channel === f.value
                    ? "bg-[--color-brand] text-white"
                    : "text-[--color-muted] hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={() => setOnlyOptedOut((v) => !v)}
              className={cn(
                "ml-1 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
                onlyOptedOut
                  ? "bg-red-500 text-white"
                  : "text-[--color-muted] hover:bg-black/5 dark:hover:bg-white/5"
              )}
              title="Contactos que pidieron no recibir mensajes"
            >
              <Ban className="h-3 w-3" />
              De baja
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-[--color-muted]">Cargando…</p>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[--color-muted]">
                {q || channel || onlyOptedOut
                  ? "Ningún contacto coincide con el filtro."
                  : "Todavía no hay contactos."}
              </p>
              {!q && !channel && !onlyOptedOut && (
                <p className="mt-1 text-xs text-[--color-muted]">
                  Se crean solos cuando alguien escribe por cualquiera de los tres
                  canales.
                </p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[--color-surface] text-left text-xs text-[--color-muted]">
                <tr className="border-b border-[--color-border]">
                  <th className="px-4 py-2 font-medium">Contacto</th>
                  <th className="px-3 py-2 font-medium">Canales</th>
                  <th className="px-3 py-2 font-medium">Oportunidades</th>
                  <th className="px-3 py-2 font-medium">Último mensaje</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ contact, channels, openLeads, lastMessageAt }) => (
                  <tr
                    key={contact.id}
                    onClick={() => setSelected(contact.id)}
                    className={cn(
                      "cursor-pointer border-b border-[--color-border] hover:bg-black/[0.03] dark:hover:bg-white/[0.03]",
                      selected === contact.id && "bg-[--color-brand]/5"
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {contact.name ?? contact.phone ?? "Sin nombre"}
                        </span>
                        {contact.optedOut && (
                          <span
                            className="flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-600 dark:text-red-400"
                            title="Pidió no recibir mensajes"
                          >
                            <Ban className="h-2.5 w-2.5" />
                            Baja
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[--color-muted]">
                        {[contact.phone, contact.email, contact.company]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        {channels.length === 0 ? (
                          <span className="text-xs text-[--color-muted]">—</span>
                        ) : (
                          channels.map((c) => (
                            <span
                              key={c}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px]",
                                CHANNEL_STYLE[c]?.badge
                              )}
                            >
                              {CHANNEL_STYLE[c]?.label ?? c}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[--color-muted]">
                      {openLeads > 0 ? `${openLeads} abierta(s)` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[--color-muted]">
                      {timeAgo(lastMessageAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected !== null && (
        <ContactDetail
          contactId={selected}
          onClose={() => setSelected(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

interface DetailData {
  contact: Row["contact"] & {
    location: string | null;
    notes: string | null;
  };
  identities: Array<{ id: number; channel: string; externalId: string }>;
  leads: Array<{
    lead: { id: number; title: string; valueCents: number; status: string };
    stage: { name: string };
  }>;
  conversations: Array<{ id: number; channel: string; lastMessageAt: string | null }>;
  timeline: Array<{ id: number; type: string; summary: string | null; createdAt: string }>;
}

const FIELDS = [
  { key: "name", label: "Nombre" },
  { key: "phone", label: "Teléfono" },
  { key: "email", label: "Email" },
  { key: "company", label: "Empresa" },
  { key: "location", label: "Ubicación" },
  { key: "source", label: "Origen" },
] as const;

function ContactDetail({
  contactId,
  onClose,
  onSaved,
}: {
  contactId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<DetailData | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/contacts/${contactId}`);
    if (!res.ok) return;
    const d: DetailData = await res.json();
    setData(d);
    setForm({
      name: d.contact.name ?? "",
      phone: d.contact.phone ?? "",
      email: d.contact.email ?? "",
      company: d.contact.company ?? "",
      location: d.contact.location ?? "",
      source: d.contact.source ?? "",
      notes: d.contact.notes ?? "",
    });
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    await load();
    onSaved();
  }

  async function toggleOptOut() {
    if (!data) return;
    const next = !data.contact.optedOut;

    if (next && !confirm("¿Marcar de baja? Se bloqueará todo envío a este contacto."))
      return;
    if (
      !next &&
      !confirm(
        "¿Quitar la baja? Solo hazlo si el contacto volvió a pedir información. " +
          "Escribir a quien pidió no recibir mensajes genera quejas y es la vía rápida al bloqueo."
      )
    )
      return;

    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optedOut: next }),
    });
    await load();
    onSaved();
  }

  if (!data) {
    return (
      <aside className="w-80 shrink-0 border-l border-[--color-border] bg-[--color-surface] p-4">
        <p className="text-sm text-[--color-muted]">Cargando…</p>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-[--color-border] bg-[--color-surface]">
      <div className="flex items-center justify-between border-b border-[--color-border] px-4 py-3">
        <h2 className="text-sm font-semibold">Ficha</h2>
        <button
          onClick={onClose}
          className="text-xs text-[--color-muted] hover:underline"
        >
          Cerrar
        </button>
      </div>

      {data.contact.optedOut && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
          <Ban className="h-3.5 w-3.5 shrink-0" />
          Pidió no recibir mensajes. Todo envío está bloqueado.
        </div>
      )}

      <div className="space-y-2.5 p-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-xs text-[--color-muted]">{f.label}</span>
            <input
              value={form[f.key] ?? ""}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-[--color-border] bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[--color-brand]"
            />
          </label>
        ))}

        <label className="block">
          <span className="text-xs text-[--color-muted]">Notas</span>
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            className="mt-0.5 w-full resize-none rounded-lg border border-[--color-border] bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[--color-brand]"
          />
        </label>

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-lg bg-[--color-brand] py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      <Section title="Identidades de canal">
        {data.identities.length === 0 ? (
          <p className="text-xs text-[--color-muted]">Sin identidades registradas.</p>
        ) : (
          data.identities.map((i) => (
            <div key={i.id} className="flex items-center justify-between text-xs">
              <span className={cn("rounded px-1.5 py-0.5", CHANNEL_STYLE[i.channel]?.badge)}>
                {CHANNEL_STYLE[i.channel]?.label ?? i.channel}
              </span>
              <code className="truncate text-[--color-muted]">{i.externalId}</code>
            </div>
          ))
        )}
      </Section>

      <Section title="Conversaciones">
        {data.conversations.length === 0 ? (
          <p className="text-xs text-[--color-muted]">Sin conversaciones.</p>
        ) : (
          data.conversations.map((c) => (
            <Link
              key={c.id}
              href={`/inbox?conversation=${c.id}`}
              className="flex items-center justify-between text-xs hover:underline"
            >
              <span className="flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3" />
                {CHANNEL_STYLE[c.channel]?.label ?? c.channel}
              </span>
              <span className="text-[--color-muted]">{timeAgo(c.lastMessageAt)}</span>
            </Link>
          ))
        )}
      </Section>

      <Section title="Oportunidades">
        {data.leads.length === 0 ? (
          <p className="text-xs text-[--color-muted]">Sin oportunidades.</p>
        ) : (
          data.leads.map(({ lead, stage }) => (
            <div key={lead.id} className="flex items-center justify-between text-xs">
              <span className="truncate">{lead.title}</span>
              <span className="shrink-0 text-[--color-muted]">{stage.name}</span>
            </div>
          ))
        )}
      </Section>

      <div className="mt-auto border-t border-[--color-border] p-4">
        <button
          onClick={toggleOptOut}
          className={cn(
            "w-full rounded-lg border py-2 text-xs",
            data.contact.optedOut
              ? "border-[--color-border] text-[--color-muted] hover:bg-black/5 dark:hover:bg-white/5"
              : "border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-400"
          )}
        >
          {data.contact.optedOut ? "Quitar la baja" : "Marcar de baja"}
        </button>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[--color-border] p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase text-[--color-muted]">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}
