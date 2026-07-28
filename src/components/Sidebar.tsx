"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Inbox,
  KanbanSquare,
  ListTodo,
  LogOut,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/inbox", label: "Bandeja", icon: Inbox },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/tasks", label: "Tareas", icon: ListTodo },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-16 flex-col items-center border-r border-[--color-border] bg-[--color-surface] py-3 lg:w-56 lg:items-stretch lg:px-3">
      <div className="mb-6 px-2 text-center lg:text-left">
        <span className="text-sm font-semibold lg:text-base">CRM</span>
        <span className="hidden text-sm text-[--color-muted] lg:inline"> Omnicanal</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors lg:justify-start",
                active
                  ? "bg-[--color-brand]/10 font-medium text-[--color-brand]"
                  : "text-[--color-muted] hover:bg-black/5 dark:hover:bg-white/5"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[--color-border] pt-3">
        <p className="hidden truncate px-3 pb-2 text-xs text-[--color-muted] lg:block">
          {email}
        </p>
        <button
          onClick={logout}
          title="Salir"
          className="flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm text-[--color-muted] hover:bg-black/5 lg:justify-start dark:hover:bg-white/5"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="hidden lg:inline">Salir</span>
        </button>
      </div>
    </aside>
  );
}
