"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChannelStatus {
  channel: string;
  label: string;
  configured: boolean;
  ok: boolean;
  detail: string;
}

export function ChannelsStatus() {
  const [rows, setRows] = useState<ChannelStatus[] | null>(null);

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => (r.ok ? r.json() : null))
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (!rows) {
    return <p className="mt-2 text-sm text-[--color-muted]">Verificando…</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      {rows.map((r) => (
        <div
          key={r.channel}
          className="flex items-start gap-3 rounded-lg border border-[--color-border] bg-[--color-surface] p-3"
        >
          {r.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <XCircle
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                r.configured ? "text-red-600" : "text-[--color-muted]"
              )}
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">{r.label}</p>
            <p className="break-words text-xs text-[--color-muted]">{r.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
