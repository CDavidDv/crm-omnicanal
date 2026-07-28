# Credenciales — guía de obtención y asignación

Todas las variables viven en `.env.local` (dev) o en las variables de entorno del
hosting (producción). La plantilla vacía está en `.env.example`.

> **Regla:** ningún token se escribe en código, en este documento, ni en un commit.
> Si un token se filtró: Meta App > Configuración > Básica > **Restablecer clave secreta**,
> y en Business Manager revocar el token del System User.

---

## Tabla de asignación

Llenar conforme se vayan consiguiendo. Marcar ✅ cuando esté en `.env.local` y en el hosting.

| # | Variable | Dónde se saca | Responsable | Estado |
|---|----------|---------------|-------------|--------|
| 1 | `DATABASE_URL` | Neon / Supabase / Railway / Docker local | | ⬜ |
| 2 | `SESSION_SECRET` | `openssl rand -base64 32` | | ⬜ |
| 3 | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Tú lo defines | | ⬜ |
| 4 | `META_APP_ID` | Meta App > Configuración > Básica | | ⬜ |
| 5 | `META_APP_SECRET` | Meta App > Configuración > Básica | | ⬜ |
| 6 | `META_WEBHOOK_VERIFY_TOKEN` | Lo inventas tú | | ⬜ |
| 7 | `WHATSAPP_PHONE_NUMBER_ID` | Meta App > WhatsApp > API Setup | | ⬜ |
| 8 | `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta App > WhatsApp > API Setup | | ⬜ |
| 9 | `WHATSAPP_ACCESS_TOKEN` | System User (permanente) | | ⬜ |
| 10 | `FACEBOOK_PAGE_ID` | Página FB > Acerca de | | ⬜ |
| 11 | `FACEBOOK_PAGE_ACCESS_TOKEN` | System User con acceso a la Página | | ⬜ |
| 12 | `INSTAGRAM_ACCOUNT_ID` | Graph API Explorer (ver abajo) | | ⬜ |
| 13 | `INSTAGRAM_ACCESS_TOKEN` | Mismo Page Token de #11 | | ⬜ |
| 14 | `ANTHROPIC_API_KEY` | console.anthropic.com (opcional) | | ⬜ |

---

## Prerrequisitos de negocio (esto es lo que más tarda — empezar ya)

| Requisito | Para qué | Tiempo |
|-----------|----------|--------|
| Cuenta en Meta Business Manager | Contenedor de todo | minutos |
| Página de Facebook | Messenger + vincular IG | minutos |
| Cuenta de Instagram **profesional** (Business/Creator) vinculada a la Página | Instagram Direct | minutos |
| Número de teléfono **sin WhatsApp activo** | WhatsApp Cloud API | inmediato |
| **Verificación de negocio** (documentos fiscales) | Acceso avanzado / producción pública | 1–10 días hábiles |
| **App Review** de permisos | Atender cuentas de terceros | 1–4 semanas |

> **Importante:** en **modo desarrollo** la app funciona ya mismo con **tus propias**
> páginas y cuentas (los roles admin/dev/tester pueden escribir al bot). Eso basta
> para tener el CRM operando esta semana. La verificación y el App Review solo hacen
> falta para atender público general o clientes externos.

---

## 1. Crear la Meta App

1. https://developers.facebook.com/apps → **Crear app**
2. Caso de uso: **Otro** → tipo **Negocio**
3. Vincularla a tu Business Manager
4. Copiar `META_APP_ID` y `META_APP_SECRET` de *Configuración > Básica*

## 2. Token permanente (System User) — hazlo una sola vez para los 3 canales

El token que Meta te da en la pantalla de prueba **caduca en 24 h**. Para producción:

1. Business Manager > **Configuración del negocio** > *Usuarios* > **Usuarios del sistema**
2. **Agregar** → nombre `crm-omnicanal` → rol **Administrador**
3. **Agregar activos**: la Página de Facebook, la cuenta de WhatsApp Business (WABA)
   y la cuenta de Instagram → control total
4. **Generar nuevo token** → app = tu Meta App → **caducidad: nunca** → permisos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `pages_messaging`
   - `pages_manage_metadata`
   - `pages_show_list`
   - `instagram_basic`
   - `instagram_manage_messages`
   - `business_management`
5. Copiar el token **una sola vez** (no se vuelve a mostrar).
   Sirve para `WHATSAPP_ACCESS_TOKEN`, `FACEBOOK_PAGE_ACCESS_TOKEN` e `INSTAGRAM_ACCESS_TOKEN`.

Verificar caducidad y permisos: https://developers.facebook.com/tools/debug/accesstoken/

## 3. WhatsApp Cloud API

1. Meta App > **Agregar producto** > WhatsApp > *Configuración de la API*
2. Ahí salen `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_BUSINESS_ACCOUNT_ID`
3. Meta regala un **número de prueba** para arrancar hoy mismo
4. Número propio: *Agregar número* → verificación por SMS/llamada.
   El número **no debe tener WhatsApp normal ni Business app activo** — si lo tiene,
   hay que borrar esa cuenta primero

Límites iniciales: 1.000 conversaciones de servicio al mes gratis y 250 destinatarios
únicos/24 h. Sube solo con buena calidad de cuenta.

## 4. Facebook Messenger

1. Meta App > **Agregar producto** > Messenger > *Configuración*
2. **Agregar o quitar páginas** → seleccionar tu Página → `FACEBOOK_PAGE_ID`
3. El Page Access Token sale del System User del paso 2

## 5. Instagram Direct

1. La cuenta de IG debe ser **profesional** y estar vinculada a la Página
   (IG app > Configuración > Cuenta > Herramientas de negocio > Vincular Página)
2. En la app de Instagram: *Configuración > Privacidad de mensajes* →
   **Permitir el acceso a mensajes** (si esto está apagado, el webhook nunca llega)
3. Obtener `INSTAGRAM_ACCOUNT_ID` con el Graph API Explorer:
   `GET /{PAGE_ID}?fields=instagram_business_account` → devuelve el ID

## 6. Webhook (uno solo para los 3 canales)

URL: `https://TU-DOMINIO/api/webhooks/meta`
Verify token: el valor de `META_WEBHOOK_VERIFY_TOKEN`

Suscribir campos en cada producto:

| Producto | Objeto | Campos |
|----------|--------|--------|
| WhatsApp | `whatsapp_business_account` | `messages` |
| Messenger | `page` | `messages`, `messaging_postbacks`, `message_reactions` |
| Instagram | `instagram` | `messages`, `messaging_postbacks` |

En Messenger hay que además **suscribir la Página** a la app (misma pantalla).

Meta exige **HTTPS válido**. En local:

```bash
cloudflared tunnel --url http://localhost:3000
# o: ngrok http 3000
```

Pegar la URL pública en Meta. Cada vez que reinicies el túnel cambia la URL y hay
que volver a registrarla.

## 7. Verificar que todo quedó

```bash
# Token vivo y con permisos
curl "https://graph.facebook.com/v21.0/me?access_token=$TOKEN"

# WhatsApp: número dado de alta
curl "https://graph.facebook.com/v21.0/$WHATSAPP_PHONE_NUMBER_ID?access_token=$TOKEN"

# Página suscrita a la app
curl "https://graph.facebook.com/v21.0/$FACEBOOK_PAGE_ID/subscribed_apps?access_token=$TOKEN"
```

En el CRM: **Configuración > Canales** muestra el estado de cada canal en vivo.

---

## Rotación y seguridad

- Token de System User: rotar cada 6–12 meses o al salir alguien del equipo
- `META_APP_SECRET`: se usa para validar la firma `X-Hub-Signature-256` de cada
  webhook. Si está mal, **todos** los webhooks se rechazan (por diseño)
- Producción: cargar las variables en el gestor de secretos del hosting, no en archivo
- `SESSION_SECRET` distinto entre dev y prod
