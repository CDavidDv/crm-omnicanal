/**
 * Simulador de webhooks de Meta para desarrollo local.
 *
 * Construye el mismo payload que manda Meta, lo firma con HMAC-SHA256 usando
 * META_APP_SECRET y lo POSTea al webhook local. El handler no distingue: valida
 * la firma igual que en producción, así que se ejercita el camino real completo
 * (firma → bitácora → ingesta → contacto → conversación → mensaje).
 *
 * NO habla con Meta ni automatiza nada: solo golpea tu propio localhost.
 *
 *   npm run simulate -- --text "hola, info por favor"
 *   npm run simulate -- --channel messenger --from 998877 --text "sigo interesado"
 *   npm run simulate -- --channel instagram --name "Ana" --text "cuánto cuesta?"
 *   npm run simulate -- --text "dar de baja"          # dispara el opt-out
 *   npm run simulate -- --status delivered --mid wamid.MOCKabc123
 *
 * Standalone a propósito: no usa el alias "@/" (igual que scripts/seed.ts).
 */
import crypto from "node:crypto";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

type Channel = "whatsapp" | "messenger" | "instagram";

// -----------------------------------------------------------------------------
// Argumentos
// -----------------------------------------------------------------------------
function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const channel = (arg("channel", "whatsapp") as Channel) ?? "whatsapp";
const text = arg("text", "Hola, vi su anuncio y quiero información")!;
const name = arg("name", "Cliente de Prueba")!;
const status = arg("status");
const mid = arg("mid");

const DEFAULT_FROM: Record<Channel, string> = {
  whatsapp: "5215512345678",
  messenger: "7100000000000001",
  instagram: "17841400000000001",
};

const from = arg("from", DEFAULT_FROM[channel])!;
const appUrl = process.env.APP_URL || "http://localhost:3000";
const secret = process.env.META_APP_SECRET;

if (!["whatsapp", "messenger", "instagram"].includes(channel)) {
  console.error(`❌ --channel inválido: ${channel}`);
  process.exit(1);
}

if (!secret) {
  console.error(
    "❌ Falta META_APP_SECRET en .env.local\n" +
      "   Para desarrollo local inventa uno cualquiera (el webhook solo compara\n" +
      "   la firma contra ese mismo valor):\n" +
      "     META_APP_SECRET=dev-secret-local-no-es-de-meta"
  );
  process.exit(1);
}

// -----------------------------------------------------------------------------
// Payloads — mismo formato que manda Meta
// -----------------------------------------------------------------------------
const now = Date.now();
const messageId =
  channel === "whatsapp"
    ? `wamid.SIM${now}`
    : `mid.SIM${now}`;

function whatsappInbound() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "0",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550000000", phone_number_id: "0" },
              contacts: [{ profile: { name }, wa_id: from }],
              messages: [
                {
                  from,
                  id: messageId,
                  // WhatsApp manda el timestamp en SEGUNDOS.
                  timestamp: String(Math.floor(now / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function whatsappStatus() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "0",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550000000", phone_number_id: "0" },
              statuses: [
                {
                  id: mid,
                  status,
                  timestamp: String(Math.floor(now / 1000)),
                  recipient_id: from,
                  ...(status === "failed"
                    ? { errors: [{ code: 131047, title: "Simulado: fuera de ventana" }] }
                    : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/** Messenger e Instagram comparten formato; solo cambia `object`. */
function messagingInbound(ch: "messenger" | "instagram") {
  return {
    object: ch === "instagram" ? "instagram" : "page",
    entry: [
      {
        id: "0",
        time: now,
        messaging: [
          {
            sender: { id: from },
            recipient: { id: "0" },
            // Aquí el timestamp va en MILISEGUNDOS, a diferencia de WhatsApp.
            timestamp: now,
            message: { mid: messageId, text },
          },
        ],
      },
    ],
  };
}

function buildPayload() {
  if (status) {
    if (channel !== "whatsapp") {
      console.error("❌ --status solo aplica a WhatsApp: es el único canal que manda acuses.");
      process.exit(1);
    }
    if (!mid) {
      console.error("❌ --status necesita --mid <id del mensaje saliente>");
      process.exit(1);
    }
    if (!["sent", "delivered", "read", "failed"].includes(status)) {
      console.error(`❌ --status inválido: ${status} (sent|delivered|read|failed)`);
      process.exit(1);
    }
    return whatsappStatus();
  }

  if (channel === "whatsapp") return whatsappInbound();
  return messagingInbound(channel);
}

// -----------------------------------------------------------------------------
// Envío firmado
// -----------------------------------------------------------------------------
async function main() {
  const payload = buildPayload();
  // Firmar el string EXACTO que se manda: si se re-serializa cambia la firma.
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret!).update(raw, "utf8").digest("hex");
  const target = `${appUrl}/api/webhooks/meta`;

  const res = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": `sha256=${signature}`,
    },
    body: raw,
  });

  const body = await res.text();

  if (res.status === 401) {
    console.error(
      `❌ 401 firma inválida — el META_APP_SECRET del script no coincide con el\n` +
        `   que cargó el servidor. Reinicia \`npm run dev\` tras editar .env.local.`
    );
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}: ${body}`);
    process.exit(1);
  }

  if (status) {
    console.log(`✅ Acuse "${status}" enviado para ${mid}`);
  } else {
    console.log(
      `✅ Mensaje simulado entregado al webhook\n` +
        `   canal:   ${channel}\n` +
        `   de:      ${from} (${name})\n` +
        `   texto:   ${text}\n` +
        `   mid:     ${messageId}\n` +
        `   Ábrelo en ${appUrl}/inbox`
    );
  }
}

main().catch((e) => {
  const hint =
    e instanceof Error && /fetch failed|ECONNREFUSED/.test(e.message)
      ? `\n   ¿Está corriendo \`npm run dev\` en ${appUrl}?`
      : "";
  console.error(`❌ ${e instanceof Error ? e.message : String(e)}${hint}`);
  process.exit(1);
});
