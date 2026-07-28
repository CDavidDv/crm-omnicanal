import { z } from "zod";

/**
 * Configuración central. Las credenciales de canal son opcionales a propósito:
 * el CRM debe arrancar con 0, 1, 2 o 3 canales configurados.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "Falta DATABASE_URL"),
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

  TZ: z.string().default("America/Mexico_City"),
  CURRENCY: z.string().default("MXN"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Configuración inválida. Revisa .env.local (plantilla en .env.example):\n${issues}`
  );
}

export const env = parsed.data;

/** Un canal está "listo" solo si tiene todas sus credenciales. */
export const channelConfig = {
  whatsapp: {
    enabled: Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
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
