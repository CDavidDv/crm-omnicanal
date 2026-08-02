# Política anti-ban

Objetivo: que **nunca** exista riesgo de bloqueo de número, Página o cuenta de Instagram.
Esto no es una recomendación, es la restricción de diseño del proyecto.

---

## 1. De dónde viene el riesgo de ban (y por qué aquí no aplica)

| Método | Riesgo | ¿Se usa aquí? |
|--------|--------|---------------|
| Baileys / whatsapp-web.js / Venom / WPPConnect | **Alto.** Ingeniería inversa del protocolo. Viola los Términos de WhatsApp. Baneo del número, a veces permanente y sin aviso | ❌ Prohibido |
| Automatización de navegador sobre facebook.com / instagram.com | **Alto.** Detección por fingerprint, bloqueo de cuenta | ❌ Prohibido |
| Cuentas de IG personales automatizadas | **Alto.** Sin API legítima para DMs | ❌ Prohibido |
| **WhatsApp Cloud API** (Graph API) | **Nulo por método.** Es el producto oficial de Meta | ✅ |
| **Messenger Platform** (Graph API) | **Nulo por método.** | ✅ |
| **Instagram Messaging API** (Graph API) | **Nulo por método.** | ✅ |

Con API oficial no hay "ban por usar bot": el bot **es** lo que Meta vende. Lo que sí
existe son **sanciones por comportamiento** (spam, quejas de usuarios). Eso se controla
en la capa de policy del código.

---

## 2. Reglas de comportamiento — implementadas en `src/lib/channels/policy.ts`

### Ventana de 24 horas

Solo se puede escribir libre dentro de las 24 h siguientes al **último mensaje del
contacto**. Fuera de eso:

| Canal | Fuera de las 24 h |
|-------|-------------------|
| WhatsApp | Solo **plantilla aprobada** (`template`). Mensaje libre → error 131047 |
| Messenger | Etiqueta `HUMAN_AGENT` (hasta 7 días) o etiquetas de mensaje permitidas |
| Instagram | Etiqueta `HUMAN_AGENT` (hasta 7 días) |

El código calcula `lastInboundAt` por conversación y **bloquea el envío** antes de
llegar a Meta. Mejor un error propio que una violación registrada en tu cuenta.

### Opt-out obligatorio

Si el contacto escribe *stop, baja, no me escribas, dejen de escribirme, cancelar
suscripción* → `contacts.opted_out = true` automáticamente. La policy rechaza
cualquier envío posterior, incluido el manual desde la bandeja.

Ignorar un opt-out es la causa #1 de quejas → caída de calidad → restricción de la cuenta.

### Nada de listas frías

El CRM **no incluye** importador de listas para envío masivo, a propósito. Solo se
escribe a:

1. Quien te escribió primero (inbound)
2. Quien dio opt-in explícito y verificable (registro con checkbox, formulario)

WhatsApp exige opt-in demostrable. Sin él, cada envío es una queja potencial.

### Ritmo de envío

- Cola con límite por canal, no ráfagas
- Respeta `429` y `Retry-After` con backoff exponencial
- WhatsApp arranca en 250 destinatarios únicos/24 h; sube solo (1k → 10k → 100k) si
  la **calidad** se mantiene en verde. Forzar volumen la tumba

### Adjuntos y respuestas rápidas

- Los adjuntos salientes pasan por la misma `canSend()` que el texto
  (`sendOutboundMedia` en `src/lib/messaging/send.ts`). Con la ventana cerrada
  se rechazan: fuera de las 24 h WhatsApp solo acepta plantilla aprobada
- El archivo se sube directo a Meta; el CRM no lo publica en ninguna URL
- Las respuestas rápidas (`quick_replies`) son **texto local que el vendedor
  inserta y edita**. No son plantillas de Meta y no habilitan enviar fuera de
  la ventana
- El cron de recordatorios (`/api/cron/reminders`) notifica al equipo, nunca a
  un contacto: un saliente automático es justo lo que rompe la ventana

### Contenido

- Nada de contenido prohibido por las políticas de comercio de Meta (alcohol,
  tabaco, armas, suplementos, apuestas, contenido adulto, productos financieros
  dudosos, medicamentos)
- Identificarse como negocio; no suplantar personas
- Plantillas: redacción clara, sin clickbait, sin promesas falsas → si no, se rechazan
  en revisión y las rechazadas repetidas afectan la calidad de la WABA

---

## 3. Señales que monitorear

| Señal | Dónde se ve | Qué hacer si baja |
|-------|-------------|-------------------|
| Calidad del número (verde/amarillo/rojo) | Business Manager > WhatsApp Manager | Pausar salientes, revisar qué molestó |
| Límite de mensajería | WhatsApp Manager | No forzar volumen |
| Tasa de bloqueo/reporte | WhatsApp Manager | Revisar segmentación y hora de envío |
| Estado de la Página | Business Manager > Calidad de la cuenta | Apelar de inmediato |

Añadir al CRM (`reports/`): mensajes enviados por día, tasa de respuesta y opt-outs.
Un pico de opt-outs es la alerta temprana antes de que Meta actúe.

---

## 4. Checklist de revisión de código

Antes de mergear cualquier cosa que toque mensajería:

- [ ] ¿La dependencia nueva es un cliente HTTP de Graph API? Si automatiza una sesión
      de usuario → rechazar
- [ ] ¿El envío pasa por `ChannelAdapter.send()`? Nada de `fetch` a Graph API suelto
- [ ] ¿Se consultó `policy.canSend()` antes de enviar?
- [ ] ¿Se respeta `opted_out`?
- [ ] ¿Los errores 4xx de Meta se registran en vez de reintentarse a ciegas?
- [ ] ¿El webhook valida `X-Hub-Signature-256`?

---

## 5. Plan B si algo se cae

No es riesgo de ban, pero conviene tenerlo escrito:

- **Número en revisión** → segundo número dado de alta en la misma WABA; cambiar
  `WHATSAPP_PHONE_NUMBER_ID` y seguir
- **Página restringida** → Messenger/IG se pausan solos (la policy detecta el error de
  permisos); WhatsApp sigue funcionando, son productos independientes
- **Token revocado** → regenerar desde System User, sin tocar código

El diseño multicanal es también la red de seguridad: si un canal se cae, los otros dos
siguen operando y el historial del CRM queda intacto.
