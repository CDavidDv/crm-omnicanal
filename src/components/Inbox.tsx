"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Ban, Clock, Search, Send } from "lucide-react";
import { CHANNEL_STYLE, cn, timeAgo } from "@/lib/utils";
import { ContactPanel } from "./ContactPanel";

interface ConversationRow {
  id: number;
  channel: string;
  status: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  contactId: number;
  contactName: string | null;
  contactPhone: string | null;
  optedOut: boolean;
  windowHoursLeft: number;
}

interface MessageRow {
  id: number;
  direction: "inbound" | "outbound";
  type: string;
  text: string | null;
  mediaUrl: string | null;
  status: string;
  error: string | null;
  createdAt: string;
}

const CHANNEL_FILTERS = [
  { value: "", label: "Todos" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
];

export function Inbox() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [channel, setChannel] = useState("");
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams();
    if (channel) params.set("channel", channel);
    if (query) params.set("q", query);

    const res = await fetch(`/api/conversations?${params}`);
    if (!res.ok) return;
    const data: ConversationRow[] = await res.json();
    setConversations(data);
    setSelectedId((current) => current ?? data[0]?.id ?? null);
  }, [channel, query]);

  const loadMessages = useCallback(async () => {
    if (!selectedId) return;
    const res = await fetch(`/api/conversations/${selectedId}/messages`);
    if (!res.ok) return;
    setMessages(await res.json());
  }, [selectedId]);

  // Polling: suficiente para un equipo pequeño y sobrevive a reinicios.
  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 5000);
    return () => clearInterval(t);
  }, [loadConversations]);

  useEffect(() => {
    loadMessages();
    const t = setInterval(loadMessages, 4000);
    return () => clearInterval(t);
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  async function send() {
    if (!selectedId || !text.trim()) return;
    setSending(true);
    setSendError(null);

    const res = await fetch(`/api/conversations/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    setSending(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSendError(data.error ?? "No se pudo enviar");
      return;
    }

    setText("");
    await loadMessages();
    await loadConversations();
  }

  return (
    <div className="flex h-full">
      {/* Lista de conversaciones */}
      <section className="flex w-80 shrink-0 flex-col border-r border-[--color-border] bg-[--color-surface]">
        <div className="border-b border-[--color-border] p-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[--color-muted]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar contacto o mensaje"
              className="w-full rounded-lg border border-[--color-border] bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-[--color-brand]"
            />
          </div>
          <div className="mt-2 flex gap-1">
            {CHANNEL_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setChannel(f.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition-colors",
                  channel === f.value
                    ? "bg-[--color-brand] text-white"
                    : "text-[--color-muted] hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="p-4 text-sm text-[--color-muted]">
              Sin conversaciones todavía. Escríbele a tu número/página desde otra
              cuenta para probar.
            </p>
          )}

          {conversations.map((c) => {
            const style = CHANNEL_STYLE[c.channel];
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "flex w-full flex-col gap-1 border-b border-[--color-border] p-3 text-left transition-colors",
                  selectedId === c.id
                    ? "bg-[--color-brand]/5"
                    : "hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", style?.dot)} />
                  <span className="flex-1 truncate text-sm font-medium">
                    {c.contactName || c.contactPhone || "Sin nombre"}
                  </span>
                  <span className="text-xs text-[--color-muted]">
                    {timeAgo(c.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 pl-4">
                  <span className="flex-1 truncate text-xs text-[--color-muted]">
                    {c.lastMessagePreview ?? "—"}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="rounded-full bg-[--color-brand] px-1.5 text-[10px] font-medium text-white">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
                {c.optedOut && (
                  <span className="ml-4 inline-flex items-center gap-1 text-[10px] text-red-600">
                    <Ban className="h-3 w-3" /> baja solicitada
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Hilo */}
      <section className="flex flex-1 flex-col">
        {selected ? (
          <>
            <header className="flex items-center gap-3 border-b border-[--color-border] bg-[--color-surface] px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {selected.contactName || selected.contactPhone || "Sin nombre"}
                </p>
                <p className="text-xs text-[--color-muted]">
                  {CHANNEL_STYLE[selected.channel]?.label} ·{" "}
                  {selected.contactPhone ?? "sin teléfono"}
                </p>
              </div>

              {/* Ventana de 24 h: dato operativo, no decorativo */}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
                  selected.windowHoursLeft > 0
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                {selected.windowHoursLeft > 0
                  ? `${selected.windowHoursLeft} h de ventana`
                  : "Ventana cerrada"}
              </span>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "mb-2 flex",
                    m.direction === "outbound" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-2xl px-3 py-2 text-sm",
                      m.direction === "outbound"
                        ? "bg-[--color-brand] text-white"
                        : "bg-[--color-surface] border border-[--color-border]"
                    )}
                  >
                    {m.text ?? `[${m.type}]`}
                    <div
                      className={cn(
                        "mt-1 flex items-center gap-1 text-[10px]",
                        m.direction === "outbound"
                          ? "text-white/70"
                          : "text-[--color-muted]"
                      )}
                    >
                      {timeAgo(m.createdAt)}
                      {m.direction === "outbound" && ` · ${m.status}`}
                      {m.error && (
                        <span className="text-red-300" title={m.error}>
                          · error
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <footer className="border-t border-[--color-border] bg-[--color-surface] p-3">
              {sendError && (
                <div className="mb-2 flex items-start gap-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{sendError}</span>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={2}
                  placeholder={
                    selected.optedOut
                      ? "Contacto dado de baja: envío bloqueado"
                      : "Escribe un mensaje… (Enter para enviar)"
                  }
                  disabled={selected.optedOut}
                  className="flex-1 resize-none rounded-lg border border-[--color-border] bg-transparent px-3 py-2 text-sm outline-none focus:border-[--color-brand] disabled:opacity-50"
                />
                <button
                  onClick={send}
                  disabled={sending || !text.trim() || selected.optedOut}
                  className="rounded-lg bg-[--color-brand] p-2.5 text-white disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[--color-muted]">
            Selecciona una conversación
          </div>
        )}
      </section>

      {/* Ficha CRM */}
      {selected && <ContactPanel conversationId={selected.id} />}
    </div>
  );
}
