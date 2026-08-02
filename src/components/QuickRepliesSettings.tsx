"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CHANNEL_STYLE, cn } from "@/lib/utils";

interface QuickReply {
  id: number;
  title: string;
  body: string;
  channel: string | null;
  position: number;
}

const CHANNEL_OPTIONS = [
  { value: "", label: "Los tres canales" },
  { value: "whatsapp", label: "Solo WhatsApp" },
  { value: "messenger", label: "Solo Messenger" },
  { value: "instagram", label: "Solo Instagram" },
];

const EMPTY = { title: "", body: "", channel: "" };

/**
 * Alta y edición de respuestas rápidas. Es texto que el vendedor inserta en el
 * compositor y puede editar antes de mandar: no son plantillas de Meta y no
 * habilitan enviar fuera de la ventana de 24 h — eso lo sigue decidiendo la
 * policy en cada envío.
 */
export function QuickRepliesSettings() {
  const [rows, setRows] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY);

  const load = useCallback(async () => {
    const res = await fetch("/api/quick-replies");
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!draft.title.trim() || !draft.body.trim()) return;
    await fetch("/api/quick-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title.trim(),
        body: draft.body.trim(),
        channel: draft.channel || null,
        position: rows.length + 1,
      }),
    });
    setDraft(EMPTY);
    load();
  }

  async function saveEdit(id: number) {
    if (!editDraft.title.trim() || !editDraft.body.trim()) return;
    await fetch(`/api/quick-replies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editDraft.title.trim(),
        body: editDraft.body.trim(),
        channel: editDraft.channel || null,
      }),
    });
    setEditing(null);
    load();
  }

  async function remove(id: number, title: string) {
    if (!confirm(`¿Borrar la respuesta rápida "${title}"?`)) return;
    await fetch(`/api/quick-replies/${id}`, { method: "DELETE" });
    load();
  }

  function startEdit(r: QuickReply) {
    setEditing(r.id);
    setEditDraft({ title: r.title, body: r.body, channel: r.channel ?? "" });
  }

  return (
    <div className="mt-2 space-y-2">
      {loading ? (
        <p className="text-xs text-[--color-muted]">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-[--color-muted]">
          Sin respuestas rápidas. Crea la primera abajo.
        </p>
      ) : (
        rows.map((r) =>
          editing === r.id ? (
            <div
              key={r.id}
              className="rounded-lg border border-[--color-brand] bg-[--color-surface] p-3"
            >
              <Form draft={editDraft} setDraft={setEditDraft} />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => saveEdit(r.id)}
                  className="rounded-lg bg-[--color-brand] px-3 py-1.5 text-xs font-medium text-white"
                >
                  Guardar
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-[--color-border] px-3 py-1.5 text-xs text-[--color-muted]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div
              key={r.id}
              className="group rounded-lg border border-[--color-border] bg-[--color-surface] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.title}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px]",
                        r.channel
                          ? CHANNEL_STYLE[r.channel]?.badge
                          : "bg-black/5 text-[--color-muted] dark:bg-white/10"
                      )}
                    >
                      {r.channel ? CHANNEL_STYLE[r.channel]?.label : "Los 3 canales"}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-[--color-muted]">
                    {r.body}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => startEdit(r)}
                    className="rounded px-2 py-1 text-xs text-[--color-muted] hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => remove(r.id, r.title)}
                    className="rounded px-2 py-1 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    title="Borrar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        )
      )}

      <div className="rounded-lg border border-dashed border-[--color-border] p-3">
        <Form draft={draft} setDraft={setDraft} />
        <button
          onClick={create}
          disabled={!draft.title.trim() || !draft.body.trim()}
          className="mt-2 flex items-center gap-1.5 rounded-lg bg-[--color-brand] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </button>
      </div>
    </div>
  );
}

function Form({
  draft,
  setDraft,
}: {
  draft: typeof EMPTY;
  setDraft: (v: typeof EMPTY) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Título (ej. Saludo)"
          maxLength={80}
          className="min-w-0 flex-1 rounded-lg border border-[--color-border] bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[--color-brand]"
        />
        <select
          value={draft.channel}
          onChange={(e) => setDraft({ ...draft, channel: e.target.value })}
          className="rounded-lg border border-[--color-border] bg-[--color-surface] px-2 py-1.5 text-xs outline-none focus:border-[--color-brand]"
        >
          {CHANNEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={draft.body}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        placeholder="Texto que se inserta en el compositor…"
        rows={2}
        maxLength={4000}
        className="w-full resize-none rounded-lg border border-[--color-border] bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[--color-brand]"
      />
    </div>
  );
}
