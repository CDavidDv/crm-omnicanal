import { describe, expect, it } from "vitest";
import { canSend, isOptOut, windowRemainingHours } from "./policy";

/**
 * La policy es la única barrera entre el CRM y una violación de las reglas de
 * Meta. Si algo de aquí se rompe, el precio es la cuenta de WhatsApp.
 */

const hoursAgo = (n: number) => new Date(Date.now() - n * 3600_000);

describe("canSend — opt-out", () => {
  it("bloquea aunque la ventana esté abierta", () => {
    const d = canSend({
      channel: "whatsapp",
      optedOut: true,
      lastInboundAt: hoursAgo(1),
    });
    expect(d.allowed).toBe(false);
  });

  it("bloquea en los tres canales", () => {
    for (const channel of ["whatsapp", "messenger", "instagram"] as const) {
      const d = canSend({ channel, optedOut: true, lastInboundAt: hoursAgo(1) });
      expect(d.allowed).toBe(false);
    }
  });
});

describe("canSend — ventana de 24 h", () => {
  it("permite texto libre dentro de las 24 h", () => {
    const d = canSend({
      channel: "whatsapp",
      optedOut: false,
      lastInboundAt: hoursAgo(2),
    });
    expect(d).toEqual({ allowed: true, mode: "free" });
  });

  it("exige plantilla en WhatsApp pasadas las 24 h", () => {
    const d = canSend({
      channel: "whatsapp",
      optedOut: false,
      lastInboundAt: hoursAgo(25),
    });
    expect(d).toEqual({ allowed: true, mode: "template_required" });
  });

  it("el límite es estricto: a 23:59 sigue libre, a 24:01 ya no", () => {
    const now = new Date();
    const justInside = new Date(now.getTime() - (24 * 3600_000 - 60_000));
    const justOutside = new Date(now.getTime() - (24 * 3600_000 + 60_000));

    expect(
      canSend({ channel: "whatsapp", optedOut: false, lastInboundAt: justInside, now })
    ).toEqual({ allowed: true, mode: "free" });

    expect(
      canSend({ channel: "whatsapp", optedOut: false, lastInboundAt: justOutside, now })
    ).toEqual({ allowed: true, mode: "template_required" });
  });
});

describe("canSend — Messenger e Instagram", () => {
  it("usa etiqueta de agente humano entre 24 h y 7 días", () => {
    for (const channel of ["messenger", "instagram"] as const) {
      const d = canSend({ channel, optedOut: false, lastInboundAt: hoursAgo(72) });
      expect(d).toEqual({ allowed: true, mode: "human_agent_tag" });
    }
  });

  it("bloquea pasados los 7 días", () => {
    const d = canSend({
      channel: "instagram",
      optedOut: false,
      lastInboundAt: hoursAgo(24 * 8),
    });
    expect(d.allowed).toBe(false);
  });

  it("prohíbe iniciar conversación sin inbound previo", () => {
    for (const channel of ["messenger", "instagram"] as const) {
      const d = canSend({ channel, optedOut: false, lastInboundAt: null });
      expect(d.allowed).toBe(false);
    }
  });

  it("en WhatsApp sin inbound previo permite solo plantilla", () => {
    const d = canSend({
      channel: "whatsapp",
      optedOut: false,
      lastInboundAt: null,
    });
    expect(d).toEqual({ allowed: true, mode: "template_required" });
  });
});

describe("isOptOut", () => {
  it("detecta frases de baja en español e inglés", () => {
    const frases = [
      "STOP",
      "unsubscribe",
      "dar de baja",
      "ya no me manden nada",
      "no quiero recibir mas mensajes",
      // Las cuatro grafías: la correcta lleva tilde en la segunda i.
      "elimíname de la lista",
      "eliminame de la lista",
      "elíminame de la lista",
      "no molestar",
      "dejen de escribir",
    ];
    for (const f of frases) expect(isOptOut(f), f).toBe(true);
  });

  it("no marca de baja a un cliente interesado", () => {
    const frases = [
      "hola quiero comprar",
      "me interesa la cotización",
      "¿tienen stock?",
      "gracias, lo voy a pensar",
    ];
    for (const f of frases) expect(isOptOut(f), f).toBe(false);
  });

  it("tolera vacío y null", () => {
    expect(isOptOut("")).toBe(false);
    expect(isOptOut(null)).toBe(false);
    expect(isOptOut(undefined)).toBe(false);
  });
});

describe("windowRemainingHours", () => {
  it("descuenta las horas transcurridas", () => {
    // Rango: la función trunca, y los milisegundos que pasan entre construir
    // la fecha y leerla deciden si cae en 21 o en 22.
    const left = windowRemainingHours(hoursAgo(2));
    expect(left).toBeGreaterThanOrEqual(21);
    expect(left).toBeLessThanOrEqual(22);
  });

  it("nunca es negativo ni existe sin inbound", () => {
    expect(windowRemainingHours(hoursAgo(48))).toBe(0);
    expect(windowRemainingHours(null)).toBe(0);
  });
});
