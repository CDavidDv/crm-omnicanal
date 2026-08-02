# Roadmap — estado real

Fecha de corte: 28 de julio de 2026.

## ✅ Construido (base funcional)

| Área | Detalle | Archivos |
|------|---------|----------|
| Modelo de datos | contactos, identidades de canal, conversaciones, mensajes, etapas, leads, tareas, notas, actividades, cola de salida, bitácora de webhooks | `src/lib/db/schema.ts` |
| Webhook único | WhatsApp + Messenger + Instagram, verificación GET, firma `X-Hub-Signature-256`, idempotencia, respuesta 200 siempre | `src/app/api/webhooks/meta/route.ts` |
| Adaptadores de canal | WhatsApp Cloud API (texto, plantillas, leído, media), Messenger, Instagram, health check por canal | `src/lib/channels/` |
| Policy anti-ban | ventana 24 h, etiqueta HUMAN_AGENT, plantilla obligatoria, opt-out automático | `src/lib/channels/policy.ts` |
| Ingesta | normalización de los 3 canales a un solo formato, alta automática de contacto | `src/lib/messaging/ingest.ts` |
| Envío | un solo camino con policy previa, registro de fallos de Meta | `src/lib/messaging/send.ts` |
| Auth | login, JWT en cookie httpOnly, middleware que protege todo el panel | `src/lib/auth/`, `src/middleware.ts` |
| Bandeja unificada | lista con filtro por canal y búsqueda, hilo, envío, aviso de ventana 24 h, badge de baja | `src/components/Inbox.tsx` |
| Ficha CRM | datos del contacto, oportunidades, tareas, línea de tiempo, alta rápida de oportunidad | `src/components/ContactPanel.tsx` |
| Pipeline | kanban con arrastrar y soltar, etapas configurables en DB, cierre automático ganado/perdido | `src/components/Pipeline.tsx` |
| Tareas | alta, vencidas/hoy/todas, marcar hecha | `src/components/TasksBoard.tsx` |
| Reportes | ganado del mes, conversión, pipeline por etapa, volumen 14 días, **tasa de opt-out y envíos fallidos** | `src/components/Reports.tsx` |
| Media entrante | proxy `/api/media/[id]`: resuelve `wa-media:<id>` con el token, valida que el origen sea de Meta y transmite el archivo; render de imagen/audio/video/documento en el hilo | `src/app/api/media/[id]/route.ts`, `src/components/Inbox.tsx` |
| Media saliente | adjuntar desde la bandeja; WhatsApp sube a `/media` y manda por id, Messenger va por `filedata`. Instagram no: Meta exige URL pública ahí | `src/app/api/conversations/[id]/media/route.ts`, `src/lib/channels/` |
| Plantillas WhatsApp | listado de las APROBADAS de la WABA y selector con variables cuando la ventana está cerrada | `src/app/api/templates/route.ts`, `src/components/Inbox.tsx` |
| Respuestas rápidas | snippets por canal (`channel` null = los tres), CRUD por API y selector en el compositor; el seed deja 4 de arranque | `src/app/api/quick-replies/`, `drizzle/0001_*.sql` |
| Recordatorios | `/api/cron/reminders` protegido por `CRON_SECRET`, agrupa tareas vencidas por responsable y las publica en un webhook interno | `src/app/api/cron/reminders/route.ts` |
| Export | CSV de contactos + oportunidades (compatible Excel) | `src/app/api/export/contacts/route.ts` |
| Ajustes | estado en vivo de los 3 canales, URL de webhook, política anti-ban | `src/app/(app)/settings/` |
| Infra | Dockerfile multi-stage, docker-compose con Postgres, `/api/health` | raíz |

## 🔜 Siguiente (orden sugerido)

1. **Multiusuario real** — tabla `users`, roles, asignación de conversaciones
2. **Pantalla de ajustes para las respuestas rápidas** — hoy solo hay API y
   selector; el alta se hace con `POST /api/quick-replies`
3. **Adjuntos en Instagram** — requiere alojar el archivo en una URL pública
   (S3/R2 firmado); Meta no acepta subir bytes en ese canal
4. **Migración a WebSocket/SSE** si el polling estorba
5. **IA opcional** — sugerencia de respuesta y resumen de conversación

## ⛔ Bloqueado por entorno (no por código)

Nada de lo anterior se puede probar de punta a punta hasta tener:

- **Postgres arriba** — `localhost:5432` no responde y Docker no está instalado.
  Alternativa sin Docker: Neon/Supabase y cambiar `DATABASE_URL`
- **Credenciales de Meta** — `META_APP_ID`, `META_APP_SECRET` y las de los tres
  canales están vacías en `.env.local`
- **Túnel HTTPS** — `cloudflared` para que Meta pueda entregar los webhooks

## 🚫 Fuera de alcance (decisión de diseño)

- Envíos masivos a listas frías o importadas: es la vía rápida al bloqueo
- Cualquier integración de WhatsApp no oficial (Baileys y similares)
- Automatización de navegador sobre Facebook/Instagram

## Notas de operación

- App Review de Meta: solo necesario para atender cuentas de terceros. En modo
  desarrollo funciona con tus propias páginas y cuentas.
- Sin `META_APP_SECRET` configurado, **todos** los webhooks se rechazan. Es
  intencional: sin firma no hay forma de saber si el evento viene de Meta.
