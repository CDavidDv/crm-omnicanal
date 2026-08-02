# Roadmap — estado real

Fecha de corte: 28 de julio de 2026.

## ✅ Construido (base funcional)

| Área | Detalle | Archivos |
|------|---------|----------|
| Modelo de datos | contactos, identidades de canal, conversaciones, mensajes, etapas, leads, tareas, notas, actividades, cola de salida, bitácora de webhooks | `src/lib/db/schema.ts` |
| Webhook único | WhatsApp + Messenger + Instagram, verificación GET, firma `X-Hub-Signature-256`, idempotencia, respuesta 200 siempre | `src/app/api/webhooks/meta/route.ts` |
| Adaptadores de canal | WhatsApp Cloud API (texto, plantillas, leído, media), Messenger, Instagram, health check por canal | `src/lib/channels/` |
| Policy anti-ban | ventana 24 h, etiqueta HUMAN_AGENT, plantilla obligatoria, opt-out automático | `src/lib/channels/policy.ts` |
| Rate limit | único punto de salida a Graph API: espacia llamadas por canal, reintenta 429 y transitorios honrando `Retry-After` con backoff y jitter, y **no** reintenta los rechazos definitivos | `src/lib/channels/http.ts` |
| Cola de salida | lo que falla por causa transitoria se encola; `/api/cron/outbox` drena con backoff cuadrático (hasta 5 intentos) y **vuelve a pasar la policy antes de cada reintento**: si la ventana se cerró, se descarta | `src/lib/messaging/outbox.ts` |
| Tests | vitest sobre la policy y la clasificación de errores de Graph — las dos piezas que no pueden fallar. CI en GitHub Actions | `src/lib/**/*.test.ts`, `.github/workflows/ci.yml` |
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

1. **Página de contactos** — `CLAUDE.md` la lista en la estructura pero no
   existe: ni ruta `(app)/contacts/`, ni `/api/contacts`, ni link en el sidebar.
   Hoy solo se pueden exportar a CSV
2. **Pantalla de ajustes para las respuestas rápidas** — hoy solo hay API y
   selector; el alta se hace con `POST /api/quick-replies`
3. **Etiquetas** — las tablas `tags` y `contact_tags` están en el schema sin
   una sola línea que las use
4. **Adjuntos en Instagram** — requiere alojar el archivo en una URL pública
   (S3/R2 firmado); Meta no acepta subir bytes en ese canal
5. **Migración a WebSocket/SSE** si el polling estorba. En Railway además
   abarata: el polling cada 4–5 s de `Inbox.tsx` es CPU facturable
6. **IA opcional** — sugerencia de respuesta y resumen de conversación

**Multiusuario queda fuera de alcance**: el CRM es de uso propio, un solo
usuario. El login contra `ADMIN_EMAIL`/`ADMIN_PASSWORD` es suficiente.

## 🚀 Desplegado

Producción en Railway: `https://crm-omnicanal-production.up.railway.app`
Postgres managed en el mismo proyecto, red privada (sin proxy TCP público).
Migraciones aplicadas con `db:migrate`; seed cargado.

Pendiente de configurar fuera del código:

- **Cron de la cola** — un cron externo debe pegarle cada 1–5 min a
  `/api/cron/outbox` con `Authorization: Bearer $CRON_SECRET`. Sin eso, lo que
  falle por un 429 se queda esperando en la tabla
- **Credenciales de Meta** — los tres canales aparecen como no configurados
  hasta cargarlas. Ver `docs/CREDENCIALES.md`
- **Uptime monitor** a `/api/health`: si el webhook se cae, dejas de recibir
  mensajes y no te enteras

## 🚫 Fuera de alcance (decisión de diseño)

- Envíos masivos a listas frías o importadas: es la vía rápida al bloqueo
- Cualquier integración de WhatsApp no oficial (Baileys y similares)
- Automatización de navegador sobre Facebook/Instagram

## Notas de operación

- App Review de Meta: solo necesario para atender cuentas de terceros. En modo
  desarrollo funciona con tus propias páginas y cuentas.
- Sin `META_APP_SECRET` configurado, **todos** los webhooks se rechazan. Es
  intencional: sin firma no hay forma de saber si el evento viene de Meta.
