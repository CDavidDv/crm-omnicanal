import { ChannelsStatus } from "@/components/ChannelsStatus";
import { QuickRepliesSettings } from "@/components/QuickRepliesSettings";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const webhookUrl = `${env.APP_URL}/api/webhooks/meta`;

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="text-sm font-semibold">Ajustes</h1>

      <section className="mt-4">
        <h2 className="text-xs font-semibold uppercase text-[--color-muted]">
          Canales
        </h2>
        <ChannelsStatus />
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase text-[--color-muted]">
          Webhook
        </h2>
        <div className="mt-2 rounded-lg border border-[--color-border] bg-[--color-surface] p-3 text-sm">
          <p className="text-xs text-[--color-muted]">
            Registra esta URL en los 3 productos de Meta (WhatsApp, Messenger e
            Instagram). Requiere HTTPS válido.
          </p>
          <code className="mt-2 block overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/10">
            {webhookUrl}
          </code>
          <p className="mt-2 text-xs text-[--color-muted]">
            Campos a suscribir: <code>messages</code> en los tres;
            además <code>messaging_postbacks</code> en Messenger e Instagram.
          </p>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase text-[--color-muted]">
          Respuestas rápidas
        </h2>
        <p className="mt-1 text-xs text-[--color-muted]">
          Texto que el vendedor inserta en el compositor y puede editar antes de
          mandar. No son plantillas de Meta: no habilitan escribir fuera de la
          ventana de 24 h.
        </p>
        <QuickRepliesSettings />
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase text-[--color-muted]">
          Política anti-ban
        </h2>
        <ul className="mt-2 space-y-1.5 rounded-lg border border-[--color-border] bg-[--color-surface] p-3 text-xs text-[--color-muted]">
          <li>· Solo APIs oficiales de Meta. Ninguna librería no oficial.</li>
          <li>· Ventana de 24 h validada antes de cada envío.</li>
          <li>· Fuera de 24 h: plantilla aprobada (WhatsApp) o etiqueta de agente humano (Messenger/Instagram, hasta 7 días).</li>
          <li>· Opt-out automático al detectar frases de baja: bloquea todo envío posterior.</li>
          <li>· Sin envíos masivos a listas frías: el CRM no incluye esa función a propósito.</li>
          <li className="pt-1 text-[--color-fg]">Detalle completo en <code>docs/ANTI-BAN.md</code>.</li>
        </ul>
      </section>
    </div>
  );
}
