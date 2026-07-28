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
| Export | CSV de contactos + oportunidades (compatible Excel) | `src/app/api/export/contacts/route.ts` |
| Ajustes | estado en vivo de los 3 canales, URL de webhook, política anti-ban | `src/app/(app)/settings/` |
| Infra | Dockerfile multi-stage, docker-compose con Postgres, `/api/health` | raíz |

## 🔜 Siguiente (orden sugerido)

1. **Media entrante en la UI** — proxy `/api/media/[id]` que resuelve el `wa-media:<id>`
   con el token y transmite el archivo (WhatsApp exige token y la URL caduca a 5 min)
2. **Envío de imágenes/archivos** desde la bandeja
3. **Plantillas de WhatsApp** — CRUD y selector cuando la ventana está cerrada
4. **Respuestas rápidas** (snippets) por canal
5. **Cron de recordatorios** — notificar tareas vencidas (`/api/cron/reminders`)
6. **Multiusuario real** — tabla `users`, roles, asignación de conversaciones
7. **Migración a WebSocket/SSE** si el polling estorba
8. **IA opcional** — sugerencia de respuesta y resumen de conversación

## 🚫 Fuera de alcance (decisión de diseño)

- Envíos masivos a listas frías o importadas: es la vía rápida al bloqueo
- Cualquier integración de WhatsApp no oficial (Baileys y similares)
- Automatización de navegador sobre Facebook/Instagram

## Notas de operación

- App Review de Meta: solo necesario para atender cuentas de terceros. En modo
  desarrollo funciona con tus propias páginas y cuentas.
- Sin `META_APP_SECRET` configurado, **todos** los webhooks se rechazan. Es
  intencional: sin firma no hay forma de saber si el evento viene de Meta.
