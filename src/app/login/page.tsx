"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo iniciar sesión");
      return;
    }

    router.push(params.get("next") ?? "/inbox");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-2xl border border-[--color-border] bg-[--color-surface] p-8 shadow-sm"
    >
      <h1 className="text-xl font-semibold">CRM Omnicanal</h1>
      <p className="mt-1 text-sm text-[--color-muted]">
        WhatsApp · Messenger · Instagram
      </p>

      <label className="mt-6 block text-sm font-medium">Correo</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="username"
        className="mt-1 w-full rounded-lg border border-[--color-border] bg-transparent px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
      />

      <label className="mt-4 block text-sm font-medium">Contraseña</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
        className="mt-1 w-full rounded-lg border border-[--color-border] bg-transparent px-3 py-2 text-sm outline-none focus:border-[--color-brand]"
      />

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-lg bg-[--color-brand] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
