"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";

interface Row {
  task: {
    id: number;
    title: string;
    dueAt: string;
    done: boolean;
    contactId: number | null;
  };
  contactName: string | null;
  contactPhone: string | null;
}

const SCOPES = [
  { value: "today", label: "Hoy" },
  { value: "overdue", label: "Vencidas" },
  { value: "all", label: "Todas" },
];

export function TasksBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [scope, setScope] = useState("today");
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks?scope=${scope}`);
    if (res.ok) setRows(await res.json());
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!title.trim() || !dueAt) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueAt: new Date(dueAt).toISOString() }),
    });
    setTitle("");
    setDueAt("");
    load();
  }

  async function toggle(id: number, done: boolean) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    load();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[--color-border] bg-[--color-surface] px-4 py-3">
        <h1 className="text-sm font-semibold">Seguimientos</h1>
        <div className="mt-2 flex gap-1">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              onClick={() => setScope(s.value)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs",
                scope === s.value
                  ? "bg-[--color-brand] text-white"
                  : "text-[--color-muted] hover:bg-black/5 dark:hover:bg-white/5"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <div className="border-b border-[--color-border] bg-[--color-surface] p-3">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nueva tarea: llamar a…"
            className="flex-1 rounded-lg border border-[--color-border] bg-transparent px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
          />
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="rounded-lg border border-[--color-border] bg-transparent px-3 py-2 text-sm outline-none"
          />
          <button
            onClick={create}
            className="rounded-lg bg-[--color-brand] px-4 text-sm text-white"
          >
            Agregar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {rows.length === 0 && (
          <p className="text-sm text-[--color-muted]">Nada pendiente aquí.</p>
        )}

        <ul className="space-y-2">
          {rows.map(({ task, contactName, contactPhone }) => {
            const overdue = !task.done && new Date(task.dueAt) < new Date();
            return (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-lg border border-[--color-border] bg-[--color-surface] p-3"
              >
                <button
                  onClick={() => toggle(task.id, !task.done)}
                  className="text-[--color-muted] hover:text-emerald-600"
                >
                  {task.done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>

                <div className="flex-1">
                  <p className={cn("text-sm", task.done && "line-through opacity-60")}>
                    {task.title}
                  </p>
                  {(contactName || contactPhone) && (
                    <p className="text-xs text-[--color-muted]">
                      {contactName ?? contactPhone}
                    </p>
                  )}
                </div>

                <span
                  className={cn(
                    "text-xs",
                    overdue ? "font-medium text-red-600" : "text-[--color-muted]"
                  )}
                >
                  {formatDateTime(task.dueAt)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
