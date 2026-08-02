import type { Channel } from "@/lib/db/schema";

/**
 * Capa anti-ban. TODO envío saliente pasa por aquí antes de tocar Graph API.
 * Ver docs/ANTI-BAN.md.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Messenger e Instagram permiten HUMAN_AGENT hasta 7 días. */
const HUMAN_AGENT_MS = 7 * DAY_MS;

export type SendDecision =
  | { allowed: true; mode: "free" }
  | { allowed: true; mode: "human_agent_tag" }
  | { allowed: true; mode: "template_required" }
  | { allowed: false; reason: string };

export interface SendContext {
  channel: Channel;
  optedOut: boolean;
  /** Último mensaje recibido DEL CONTACTO. Null = nunca escribió. */
  lastInboundAt: Date | null;
  now?: Date;
}

export function canSend(ctx: SendContext): SendDecision {
  const now = ctx.now ?? new Date();

  // 1. Opt-out gana sobre todo, incluso sobre el envío manual del vendedor.
  if (ctx.optedOut) {
    return {
      allowed: false,
      reason:
        "El contacto pidió no recibir mensajes (opt-out). Envío bloqueado por política anti-ban.",
    };
  }

  // 2. Sin inbound previo no hay ventana. Solo plantilla aprobada (WA) y nada
  //    en Messenger/IG: escribir primero ahí no está permitido.
  if (!ctx.lastInboundAt) {
    if (ctx.channel === "whatsapp") {
      return { allowed: true, mode: "template_required" };
    }
    return {
      allowed: false,
      reason:
        "El contacto nunca ha escrito por este canal. Meta no permite iniciar conversación en Messenger/Instagram.",
    };
  }

  const elapsed = now.getTime() - ctx.lastInboundAt.getTime();

  // 3. Dentro de las 24 h: mensaje libre.
  if (elapsed < DAY_MS) return { allowed: true, mode: "free" };

  // 4. Fuera de las 24 h.
  if (ctx.channel === "whatsapp") {
    return { allowed: true, mode: "template_required" };
  }

  if (elapsed < HUMAN_AGENT_MS) {
    return { allowed: true, mode: "human_agent_tag" };
  }

  return {
    allowed: false,
    reason:
      "Pasaron más de 7 días desde el último mensaje del contacto. Meta no permite responder en este canal.",
  };
}

/** Frases de baja. Al detectarlas se marca opted_out y se corta todo envío. */
const OPT_OUT_PATTERNS: RegExp[] = [
  /\bstop\b/i,
  /\bunsubscribe\b/i,
  /\bbaja\b/i,
  /\bdar de baja\b/i,
  /\bno me escrib/i,
  /\bdejen? de escribir/i,
  /\bno quiero (recibir|mas|más)/i,
  /\bcancelar suscri/i,
  /\bya no me manden/i,
  // La forma correcta lleva tilde en la segunda i ("elimíname"), pero llega de
  // las cuatro maneras. El patrón anterior no cubría justo la bien escrita.
  /\bel[ií]m[ií]name\b/i,
  /\bno molestar\b/i,
];

export function isOptOut(text: string | undefined | null): boolean {
  if (!text) return false;
  return OPT_OUT_PATTERNS.some((re) => re.test(text));
}

/** Horas restantes de ventana libre. Se muestra en la bandeja. */
export function windowRemainingHours(lastInboundAt: Date | null): number {
  if (!lastInboundAt) return 0;
  const left = DAY_MS - (Date.now() - lastInboundAt.getTime());
  return Math.max(0, Math.floor(left / (60 * 60 * 1000)));
}
