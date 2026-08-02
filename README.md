# CRM Omnicanal

CRM de ventas con bandeja unificada de **WhatsApp, Facebook Messenger e Instagram
Direct**, pipeline kanban, tareas, reportes y export.

> **Solo APIs oficiales de Meta.** Nada de Baileys, whatsapp-web.js, Venom ni
> automatización de navegador. Ver [`docs/ANTI-BAN.md`](docs/ANTI-BAN.md).

## Tecnologías

- **Next.js 16** (App Router) + React 19 + TypeScript — UI, API y webhook en un proceso
- **Tailwind v4** — estilos
- **PostgreSQL + Drizzle ORM** — datos (portable: Neon, Supabase, Railway, VPS)
- **jose** — sesión JWT en cookie httpOnly
- **zod** — validación de payloads
- **Docker** (`output: standalone`) — mismo artefacto en cualquier hosting
- **Graph API de Meta** — WhatsApp Cloud API + Messenger Platform + Instagram Messaging

## Arranque en local

```bash
npm install
docker compose up -d db          # Postgres local
cp .env.example .env.local       # llenar credenciales (ver docs/CREDENCIALES.md)
npm run db:push                  # crea las tablas
npm run db:seed                  # etapas del pipeline
npm run dev                      # http://localhost:3000
```

Login con `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env.local`.

**Sin credenciales de Meta:** con `MOCK_CHANNELS=1` los 3 canales se simulan y
`npm run simulate` inyecta mensajes entrantes firmados en el webhook local. Se
prueba el CRM entero sin tocar Meta — guía en [`docs/LOCAL.md`](docs/LOCAL.md).

Para recibir mensajes reales hace falta una URL pública con HTTPS:

```bash
cloudflared tunnel --url http://localhost:3000
```

y registrar `https://esa-url/api/webhooks/meta` en Meta.

## Recordatorios de tareas vencidas

Ruta pensada para un cron externo (crontab, GitHub Actions, Railway cron…).
Solo notifica al equipo: nunca escribe a un contacto, porque un envío
automático rompería la ventana de 24 h.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://tu-crm/api/cron/reminders
```

Sin `CRON_SECRET` la ruta responde 503. Con `REMINDERS_WEBHOOK_URL` el resumen
se publica además en Slack/Discord/n8n.

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [`CLAUDE.md`](CLAUDE.md) | Reglas del proyecto para trabajar con Claude Code |
| [`docs/LOCAL.md`](docs/LOCAL.md) | Probar todo en local sin credenciales de Meta |
| [`docs/CREDENCIALES.md`](docs/CREDENCIALES.md) | Cómo obtener cada token, tabla de asignación |
| [`docs/ANTI-BAN.md`](docs/ANTI-BAN.md) | Política de cero riesgo de bloqueo |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Dónde montarlo y cómo |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Qué está hecho y qué sigue |

## Cómo funciona

```
Cliente escribe en WhatsApp / Messenger / Instagram
        ↓  (webhook firmado)
POST /api/webhooks/meta          ← valida X-Hub-Signature-256, responde 200
        ↓
ingest.ts   normaliza los 3 formatos a uno solo
        ↓
Postgres    contacto + identidad de canal + conversación + mensaje + actividad
        ↓
Bandeja unificada (polling)
        ↓
Vendedor responde
        ↓
policy.ts   ¿opt-out? ¿ventana de 24 h? ¿hace falta plantilla?
        ↓
Adaptador del canal → Graph API oficial
```

## Estructura

```
src/
  app/
    (app)/        panel: inbox, pipeline, tasks, reports, settings
    api/          webhooks/meta, conversations, media, templates,
                  quick-replies, leads, tasks, metrics, export, cron
    login/
  lib/
    db/           schema Drizzle + cliente
    channels/     adaptadores por canal + policy anti-ban
    messaging/    ingesta y envío
    auth/         sesión JWT
  components/     UI
```

## Estado

Base funcional completa (bandeja, pipeline, tareas, reportes, auth, deploy).
Pendientes y orden sugerido en [`docs/ROADMAP.md`](docs/ROADMAP.md).
