import { z } from "zod";

/**
 * Configuración central. Las credenciales de canal son opcionales a propósito:
 * el CRM debe arrancar con 0, 1, 2 o 3 canales configurados.
 */
const schema = z.object({
  /**
   * Opcional a propósito: en Cloudflare Workers la conexión llega por el
   * binding HYPERDRIVE, no por variable de entorno. Fuera de Workers (next dev,
   * scripts, tests) sí hace falta, y `src/lib/db/index.ts` falla con un mensaje
   * claro si no hay ninguna de las dos.
   */
  DATABASE_URL: z.string().optional(),
  APP_URL: z.string().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET debe tener 16+ caracteres"),
  ADMIN_EMAIL: z.string().default("admin@localhost"),
  ADMIN_PASSWORD: z.string().min(1, "Falta ADMIN_PASSWORD"),

  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_GRAPH_VERSION: z.string().default("v21.0"),

  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),

  FACEBOOK_PAGE_ID: z.string().optional(),
  FACEBOOK_PAGE_ACCESS_TOKEN: z.string().optional(),

  INSTAGRAM_ACCOUNT_ID: z.string().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-sonnet-5"),

  /** Protege /api/cron/*. Sin esto la ruta queda deshabilitada. */
  CRON_SECRET: z.string().optional(),
  /** Destino opcional del resumen de tareas vencidas (Slack, Discord, n8n…). */
  REMINDERS_WEBHOOK_URL: z.string().optional(),

  TZ: z.string().default("America/Mexico_City"),
  CURRENCY: z.string().default("MXN"),

  /**
   * Solo desarrollo: "1" reemplaza los adaptadores por mocks que no llaman a
   * Graph API. Permite probar el CRM entero sin credenciales de Meta.
   */
  MOCK_CHANNELS: z.string().optional(),
});

/**
 * `next build` evalúa el módulo de cada ruta para recolectar sus metadatos, y
 * ahí todavía no hay credenciales. No debe haberlas: en un build por Dockerfile
 * meterlas significaría hornear los secretos en las capas de la imagen.
 * Durante esa fase se usan valores de relleno que nunca atienden una petición;
 * en runtime la validación sigue siendo estricta y aborta el arranque.
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

const parsed = schema.safeParse(process.env);

if (!parsed.success && !isBuildPhase) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Configuración inválida. Revisa .env.local (plantilla en .env.example):\n${issues}`
  );
}

/** Relleno de build. Solo se usa cuando `isBuildPhase` es true. */
const BUILD_PLACEHOLDER = schema.parse({
  SESSION_SECRET: "placeholder-solo-para-la-fase-de-build",
  ADMIN_PASSWORD: "placeholder-solo-para-la-fase-de-build",
});

export const env = parsed.success ? parsed.data : BUILD_PLACEHOLDER;

/**
 * Los canales simulados jamás deben llegar a producción: un envío que el
 * vendedor cree entregado y que nunca salió es peor que un error visible.
 * Se falla en el arranque, no en silencio.
 */
if (
  !isBuildPhase &&
  env.MOCK_CHANNELS === "1" &&
  process.env.NODE_ENV === "production"
) {
  throw new Error(
    "MOCK_CHANNELS=1 con NODE_ENV=production. Los canales simulados son solo " +
      "para desarrollo local: quita la variable del entorno de producción."
  );
}

export const MOCK_CHANNELS = env.MOCK_CHANNELS === "1";

/** Un canal está "listo" solo si tiene todas sus credenciales. */
export const channelConfig = {
  whatsapp: {
    enabled: Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    /** Solo hace falta para listar plantillas: viven en la WABA, no en el número. */
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    token: env.WHATSAPP_ACCESS_TOKEN,
  },
  messenger: {
    enabled: Boolean(env.FACEBOOK_PAGE_ID && env.FACEBOOK_PAGE_ACCESS_TOKEN),
    pageId: env.FACEBOOK_PAGE_ID,
    token: env.FACEBOOK_PAGE_ACCESS_TOKEN,
  },
  instagram: {
    enabled: Boolean(env.INSTAGRAM_ACCOUNT_ID && env.INSTAGRAM_ACCESS_TOKEN),
    accountId: env.INSTAGRAM_ACCOUNT_ID,
    token: env.INSTAGRAM_ACCESS_TOKEN,
  },
} as const;

export const GRAPH = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;
