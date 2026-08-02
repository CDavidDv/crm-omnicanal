# Probar en local, sin Meta y sin publicar nada

Objetivo: ver el CRM funcionando de punta a punta —mensaje entrante, bandeja,
respuesta, pipeline, métricas— **antes** de sacar credenciales de Meta y de
montarlo en un servidor.

Nada de lo que hay aquí toca Meta. No hay superficie de ban: no sale un solo
byte hacia Graph API.

---

## 1. Base de datos

No hace falta Docker. Cualquiera de las dos sirve:

**Neon (recomendado, ~3 min, sin instalar nada)**

1. [neon.tech](https://neon.tech) → *Sign up* → *Create project*
2. Copiar la connection string (`postgresql://…?sslmode=require`)
3. Pegarla en `.env.local` (o `.env`) como `DATABASE_URL`

**Docker (todo offline)**

```bash
docker compose up -d          # solo el servicio db; la app corre fuera
# DATABASE_URL=postgresql://crm:crm@localhost:5432/crm
```

Luego, en ambos casos:

```bash
npm run db:push    # crea las tablas
npm run db:seed    # 6 etapas de pipeline + 4 respuestas rápidas
```

## 2. Variables mínimas

En `.env.local` (o `.env`) basta con esto — las credenciales de Meta se quedan
vacías a propósito:

```bash
DATABASE_URL=...                                   # el del paso 1
SESSION_SECRET=...                                 # openssl rand -base64 32
ADMIN_EMAIL=admin@localhost
ADMIN_PASSWORD=...                                 # el login del panel

# Secreto inventado: el simulador firma con él y el webhook lo verifica
# contra ese mismo valor. No tiene relación con Meta.
META_APP_SECRET=dev-secret-local-no-es-de-meta

# Canales simulados: sendText/sendTemplate/sendMedia devuelven ok sin llamar
# a Graph API.
MOCK_CHANNELS=1
```

`src/lib/env.ts` deja las credenciales de los 3 canales opcionales: la app
arranca con 0 canales configurados.

## 3. Arrancar

```bash
npm run dev        # http://localhost:3000 — entrar con ADMIN_EMAIL/ADMIN_PASSWORD
```

En consola debe aparecer:
`⚠️  MOCK_CHANNELS=1 — los 3 canales están simulados. Nada sale hacia Meta.`

## 4. Simular mensajes entrantes

`scripts/simulate-inbound.ts` arma el payload exacto que manda Meta, lo firma
con HMAC-SHA256 y lo POSTea a tu propio `/api/webhooks/meta`. El handler no
distingue: valida la firma igual que en producción, así que se ejercita el
camino real completo (firma → bitácora → ingesta → alta de contacto →
conversación → mensaje).

```bash
npm run simulate -- --text "hola, quiero información"
npm run simulate -- --channel messenger --from 998877 --text "sigo interesado"
npm run simulate -- --channel instagram --name "Ana" --text "cuánto cuesta?"
```

| Flag | Default | Para qué |
|------|---------|----------|
| `--channel` | `whatsapp` | `whatsapp` \| `messenger` \| `instagram` |
| `--text` | saludo genérico | Cuerpo del mensaje |
| `--from` | uno por canal | Identidad del contacto. Cambiarlo crea otro contacto |
| `--name` | `Cliente de Prueba` | Nombre de perfil (solo WhatsApp lo manda) |
| `--status` + `--mid` | — | Acuse `sent\|delivered\|read\|failed` de un saliente (solo WhatsApp) |

## 5. Qué se puede comprobar sin Meta

| Prueba | Cómo | Qué debe pasar |
|--------|------|----------------|
| Ingesta y alta de contacto | `npm run simulate -- --text "hola"` | Aparece contacto + conversación en `/inbox` |
| Idempotencia | Repetir el mismo comando | Se crea un mensaje nuevo (cada corrida usa un `mid` distinto); reenviar el MISMO payload no duplica |
| Ventana de 24 h | Responder desde la bandeja | Sale sin problema, quedan ~23 h de ventana |
| **Opt-out** | `npm run simulate -- --text "dar de baja"` | Contacto marcado de baja; todo envío posterior se bloquea |
| Plantilla obligatoria | Envejecer `conversations.last_inbound_at` a >24 h en la DB y responder | Se exige plantilla aprobada (WhatsApp) |
| Sin inbound previo | Contacto nuevo en Messenger/IG | La policy bloquea: no se puede iniciar conversación |
| Acuses | `npm run simulate -- --status delivered --mid <id>` | El mensaje cambia de estado en el hilo |
| Pipeline, tareas, reportes | UI | Etapas del seed, kanban, métricas |
| Policy aislada, sin DB | `npm run check:policy` | 8 casos de ventana/opt-out impresos |

## 6. Límites del modo local

- **No se prueba nada de Meta.** Formato real de payloads, tokens, permisos,
  plantillas aprobadas y rate limits solo se validan contra Meta de verdad
- **Media entrante no resuelve.** El proxy `/api/media/[id]` necesita un token
  real para bajar el archivo de Meta
- **Adjuntos salientes** se registran pero no suben a ningún lado
- **Listado de plantillas** (`/api/templates`) devuelve vacío: vive en la WABA

## 7. Siguiente paso: local CON Meta

Cuando el flujo simulado ya convenza:

1. Quitar `MOCK_CHANNELS` y poner `META_APP_SECRET` real
2. Llenar las credenciales de los canales (`docs/CREDENCIALES.md`)
3. `cloudflared tunnel --url http://localhost:3000`
4. Registrar la URL del túnel en Meta como webhook

Ojo: con `META_APP_SECRET` real, el simulador deja de servir salvo que lo
firmes con ese mismo secreto — cosa que **no** conviene hacer contra una cuenta
en uso.

## 8. Producción

`MOCK_CHANNELS=1` con `NODE_ENV=production` **aborta el arranque** a propósito
(`src/lib/env.ts`). Un envío que el vendedor cree entregado y que nunca salió es
peor que un error visible. Deploy: `docs/DEPLOY.md`.
