# CLAUDE.md — CRM Omnicanal

Instrucciones para Claude Code al trabajar en este repo.

## Qué es esto

CRM de ventas omnicanal. Une **WhatsApp, Facebook Messenger e Instagram Direct** en una
bandeja única, con pipeline de leads, deals, tareas y métricas.

Proyecto **separado** de `whatsapp-assistant` (que usa Baileys y es de otro vertical).
No copiar código de ahí sin revisar: aquel proyecto usa librería no oficial.

## Regla #1 — CERO RIESGO DE BAN (innegociable)

Este CRM usa **exclusivamente APIs oficiales de Meta**. Es la restricción de diseño
principal y ninguna tarea la puede romper.

**PROHIBIDO en este repo:**

- `@whiskeysockets/baileys`, `whatsapp-web.js`, `venom-bot`, `wppconnect`, `open-wa`
  y cualquier librería que automatice WhatsApp Web/multi-device por ingeniería inversa
- Scraping o automatización de navegador sobre facebook.com / instagram.com
- Enviar mensajes fuera de la ventana de 24h sin plantilla aprobada
- Mensajes masivos no solicitados a listas compradas
- Reintentos agresivos que ignoren `429` / rate limits de Graph API

**OBLIGATORIO:**

- WhatsApp → **WhatsApp Cloud API** (Graph API oficial)
- Messenger e Instagram → **Messenger Platform** (Graph API oficial)
- Todo mensaje saliente pasa por `src/lib/channels/` — nunca llamar a Graph API suelto
- Respetar la ventana de 24h: `src/lib/channels/policy.ts` la valida antes de enviar
- Opt-out obligatorio: si un contacto pide parar, marcar `contacts.opted_out = true`
  y el envío se bloquea en la capa de policy

Antes de agregar cualquier dependencia que hable con WhatsApp/FB/IG, verificar que
sea cliente HTTP de Graph API. Si automatiza una sesión de usuario, va fuera.
Detalle completo: `docs/ANTI-BAN.md`.

## Stack

| Capa | Elección | Por qué |
|------|----------|---------|
| Framework | Next.js 16 (App Router) + React 19 + TS | Un solo proceso: UI + API + webhooks |
| Estilos | Tailwind v4 + shadcn/ui | Rápido, sin build extra |
| DB | Postgres + Drizzle ORM (`postgres-js`) | Portable a Neon/Supabase/Railway/VPS |
| Auth | JWT en cookie httpOnly (`jose`) | Sin dependencia externa |
| Validación | `zod` | Payloads de webhook y API |
| Deploy | Docker (`output: standalone`) | Corre igual en VPS, Railway, Render, Fly |

Sin SQLite a propósito: bloquea el deploy serverless y el multi-instancia.

## Estructura

```
src/
  app/
    (auth)/login/          Login
    (app)/                 Panel protegido por middleware
      inbox/               Bandeja unificada (3 canales)
      pipeline/            Kanban de leads
      contacts/            Lista de contactos
      tasks/               Seguimientos/recordatorios
      reports/             Métricas
      settings/            Canales, etapas, cuenta
    api/
      webhooks/meta/       ÚNICO webhook: WhatsApp + Messenger + Instagram
      conversations/  messages/  leads/  deals/  tasks/  metrics/  export/
  lib/
    db/schema.ts           Fuente de verdad del modelo de datos
    db/index.ts            Cliente Drizzle
    channels/              Adaptadores por canal (whatsapp | messenger | instagram)
      types.ts             Interfaz común ChannelAdapter
      policy.ts            Ventana 24h, opt-out, rate limit
      whatsapp.ts messenger.ts instagram.ts
    auth/                  Sesión JWT
  components/              UI React
```

## Convenciones

- **Toda** entrada de mensaje (de cualquier canal) se normaliza a
  `{ channel, externalUserId, text, attachments, timestamp }` antes de tocar la DB
- Un contacto puede tener varias identidades de canal → tabla `channel_identities`.
  Nunca asumir que `phone` identifica al contacto: en IG/Messenger no hay teléfono
- Fechas en DB: `timestamptz`. Formateo solo en el cliente
- Montos: entero en centavos (`amount_cents`), nunca float
- Idioma: UI y comentarios en español; nombres de código en inglés
- Errores de webhook: **siempre responder 200 a Meta** y encolar el fallo, o Meta
  reintenta y termina desuscribiendo la app

## Comandos

```bash
npm run dev           # localhost:3000
npm run db:push       # aplica schema a Postgres (dev)
npm run db:generate   # genera migración SQL (prod)
npm run db:migrate    # aplica migraciones
npm run db:studio     # explorador visual de la DB
docker compose up -d  # Postgres local
```

Para probar webhooks en local hace falta HTTPS público:
`cloudflared tunnel --url http://localhost:3000` y registrar esa URL en Meta.

## Estado actual

Ver `docs/ROADMAP.md`. Lo construido va marcado ahí; no re-implementar sin revisar.

## Credenciales

Plantilla en `.env.example`, guía de obtención en `docs/CREDENCIALES.md`.
Nunca escribir valores reales en código, docs ni commits. Si el usuario pega un
token en el chat, usarlo solo para escribir `.env.local` y no repetirlo en texto.
