# Dónde montarlo

Requisitos que impone Meta y que descartan opciones:

1. **HTTPS público con certificado válido** — el webhook no admite HTTP ni self-signed
2. **Siempre encendido** — si el servidor duerme, Meta reintenta y tras fallos repetidos
   **desuscribe la app**. Esto descarta los planes gratuitos que hibernan
3. **Respuesta < 5 s** al webhook — por eso el handler solo guarda y responde 200
4. **IP/host estable** con dominio propio

---

## Comparativa

| Opción | Costo/mes | Postgres | Complejidad | Notas |
|--------|-----------|----------|-------------|-------|
| **VPS + Docker (Hetzner/Contabo/DO)** ⭐ | €4–7 | En el mismo VPS o Neon | Media | Control total, sin límites de ejecución, lo más barato a largo plazo |
| **Railway** ⭐ para arrancar ya | ~$5–10 | Incluido, 1 clic | Baja | Deploy desde GitHub, HTTPS y dominio automáticos |
| **Render** | $7 (Starter) | $7 aparte | Baja | **No usar el plan free: duerme** y rompe el webhook |
| **Fly.io** | ~$5 | Postgres gestionado | Media | Bueno si se necesitan varias regiones |
| **Vercel + Neon** | $0–20 | Neon (free 0.5 GB) | Baja | Serverless: sin workers persistentes; recordatorios vía Vercel Cron |
| **Coolify en VPS propio** | costo del VPS | Incluido | Media | PaaS auto-hospedado, deploy con git push |

**Recomendación:** empezar en **Railway** (funcionando en ~20 min) y migrar a **VPS con
Docker** cuando el volumen o el costo lo pidan. El `Dockerfile` es el mismo, así que la
migración no cambia código.

---

## A. Railway (camino rápido)

1. Subir el repo a GitHub (privado)
2. railway.app → *New Project* → *Deploy from GitHub repo*
3. *Add service* → **PostgreSQL** → Railway inyecta `DATABASE_URL`
4. En *Variables*, pegar el resto del `.env.example` con valores reales
5. *Settings* → *Generate Domain* → queda `https://xxx.up.railway.app`
6. `APP_URL` = ese dominio
7. Aplicar el schema una vez: `npm run db:push` (con `DATABASE_URL` de Railway)
8. Registrar en Meta: `https://xxx.up.railway.app/api/webhooks/meta`

## B. VPS + Docker (recomendado a mediano plazo)

```bash
# En el VPS (Ubuntu 24.04)
curl -fsSL https://get.docker.com | sh
git clone <tu-repo> /opt/crm && cd /opt/crm
cp .env.example .env && nano .env      # llenar credenciales
docker compose --profile prod up -d
docker compose exec app npm run db:migrate
```

HTTPS con Caddy (2 líneas, certificado automático de Let's Encrypt):

```caddyfile
# /etc/caddy/Caddyfile
crm.tudominio.com {
    reverse_proxy localhost:3000
}
```

Apuntar un registro A del dominio al IP del VPS. Caddy saca el certificado solo.

**Firewall:** abrir solo 22, 80 y 443. Postgres jamás expuesto a internet.

## C. Vercel + Neon

- `output: standalone` no estorba; Vercel lo ignora
- Postgres: Neon con `?sslmode=require` y **connection pooling** activo (serverless
  abre muchas conexiones)
- Recordatorios/tareas: `vercel.json` con Cron llamando a `/api/cron/reminders`
- Límite: sin proceso persistente para la cola de salida; se resuelve procesando la
  cola dentro del propio request de envío + un cron de reintentos

---

## Backups (no opcional)

El historial de conversaciones no se puede recuperar de Meta: **si se pierde la DB,
se perdió**.

```bash
# Diario, en el VPS
docker compose exec -T db pg_dump -U crm crm | gzip > /backups/crm-$(date +%F).sql.gz
```

Neon y Supabase traen point-in-time recovery en planes de pago. Railway tiene
snapshots. Aun así, conviene un `pg_dump` semanal fuera del proveedor.

---

## Checklist de producción

- [ ] HTTPS válido y dominio propio
- [ ] `SESSION_SECRET` distinto al de desarrollo
- [ ] `ADMIN_PASSWORD` fuerte (el panel expone todas las conversaciones)
- [ ] `META_APP_SECRET` cargado → la firma del webhook se valida
- [ ] Webhook registrado y verificado en los 3 productos de Meta
- [ ] Backup automático de Postgres configurado y **probado restaurando**
- [ ] Uptime monitor apuntando a `/api/health` (si el webhook se cae, dejas de recibir
      mensajes y no te enteras)
- [ ] Zona horaria (`TZ`) correcta: afecta métricas y horarios de recordatorio
