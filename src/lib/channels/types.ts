import type { Channel } from "@/lib/db/schema";

/** Mensaje entrante ya normalizado — igual para los 3 canales. */
export interface InboundMessage {
  channel: Channel;
  /** wa_id / PSID / IGSID del contacto. */
  externalUserId: string;
  /** ID del mensaje en Meta. Se usa para idempotencia. */
  externalMessageId: string;
  type:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "sticker"
    | "location"
    | "unsupported";
  text?: string;
  mediaUrl?: string;
  mediaMime?: string;
  /** Nombre visible que envía Meta, si viene. */
  displayName?: string;
  timestamp: Date;
  raw: Record<string, unknown>;
}

/** Actualización de estado de un mensaje saliente (entregado, leído, fallido). */
export interface StatusUpdate {
  channel: Channel;
  externalMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  error?: string;
}

export interface SendTextRequest {
  to: string;
  text: string;
  /** Fuera de la ventana de 24 h. Messenger/IG: HUMAN_AGENT. */
  tag?: "HUMAN_AGENT";
}

export interface SendTemplateRequest {
  to: string;
  templateName: string;
  languageCode: string;
  /** Variables {{1}}, {{2}}... del cuerpo. */
  bodyParams?: string[];
}

/** Tipos de adjunto que los tres canales entienden. */
export type MediaKind = "image" | "audio" | "video" | "document";

export interface SendMediaRequest {
  to: string;
  kind: MediaKind;
  /** Contenido del archivo. Se sube a Meta; nunca se guarda en disco local. */
  data: Uint8Array;
  mime: string;
  filename: string;
  /** Pie de foto. WhatsApp lo soporta en image/video/document; Messenger no. */
  caption?: string;
  tag?: "HUMAN_AGENT";
}

export interface SendResult {
  ok: boolean;
  externalMessageId?: string;
  error?: string;
  /** Código de error de Meta, para diagnóstico. */
  code?: number;
  /**
   * true = el fallo es transitorio (429, 5xx, red). El envío se encola y se
   * reintenta con backoff en vez de darse por perdido. Ver channels/http.ts.
   */
  retryable?: boolean;
  /** Espera que pidió Meta en `Retry-After`, si la mandó. */
  retryAfterSec?: number;
}

export interface ChannelAdapter {
  channel: Channel;
  isEnabled(): boolean;
  sendText(req: SendTextRequest): Promise<SendResult>;
  /** Solo WhatsApp soporta plantillas fuera de las 24 h. */
  sendTemplate?(req: SendTemplateRequest): Promise<SendResult>;
  /**
   * Adjuntos salientes. Devuelve además `mediaRef` para poder previsualizar lo
   * enviado en la bandeja (en WhatsApp es `wa-media:<id>`).
   */
  sendMedia?(req: SendMediaRequest): Promise<SendResult & { mediaRef?: string }>;
  /** Diagnóstico para Configuración > Canales. */
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}
