import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyGraphError, graphFetch } from "./http";

/**
 * Reintentar lo que Meta rechazó en firme es de las formas más rápidas de
 * degradar la calidad de la cuenta. Estas pruebas fijan qué se reintenta.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("classifyGraphError — qué se reintenta", () => {
  it("429 es reintentable", () => {
    expect(classifyGraphError(429, {}).retryable).toBe(true);
  });

  it("cualquier 5xx es reintentable", () => {
    expect(classifyGraphError(500, {}).retryable).toBe(true);
    expect(classifyGraphError(503, {}).retryable).toBe(true);
  });

  it("los códigos de rate limit de Meta son reintentables", () => {
    for (const code of [4, 613, 80007, 130429, 131048, 131056]) {
      expect(
        classifyGraphError(400, { error: { code, message: "rate limit" } }).retryable,
        `código ${code}`
      ).toBe(true);
    }
  });

  it("respeta is_transient aunque el código sea desconocido", () => {
    const e = classifyGraphError(400, {
      error: { code: 99999, is_transient: true, message: "temporal" },
    });
    expect(e.retryable).toBe(true);
  });

  it("NO reintenta rechazos definitivos", () => {
    // 190 token inválido, 131047 fuera de ventana, 132000 plantilla mal formada
    for (const code of [190, 131047, 132000, 100]) {
      expect(
        classifyGraphError(400, { error: { code, message: "rechazo" } }).retryable,
        `código ${code}`
      ).toBe(false);
    }
  });

  it("conserva mensaje y código para diagnóstico", () => {
    const e = classifyGraphError(400, {
      error: { code: 131047, message: "Message failed to send" },
    });
    expect(e).toMatchObject({ code: 131047, message: "Message failed to send" });
  });
});

describe("graphFetch", () => {
  it("devuelve los datos en el camino feliz", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] })))
    );

    const res = await graphFetch("whatsapp", "https://graph.test/x", { method: "POST" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.messages[0].id).toBe("wamid.1");
  });

  it("no reintenta un rechazo definitivo: una sola llamada", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 190, message: "Invalid token" } }), {
          status: 400,
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await graphFetch("messenger", "https://graph.test/x", { method: "POST" });

    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (!res.ok) expect(res.error.retryable).toBe(false);
  });

  it("reintenta un 429 y se rinde declarándolo reintentable", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 130429, message: "Too many" } }), {
          status: 429,
          headers: { "retry-after": "1" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await graphFetch("instagram", "https://graph.test/x", { method: "POST" });

    // 1 intento + 2 reintentos en línea, luego pasa el testigo a la cola.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.retryable).toBe(true);
      expect(res.error.retryAfterSec).toBe(1);
    }
  }, 30_000);

  it("un fallo de red es reintentable, no un rechazo de Meta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      })
    );

    const res = await graphFetch("whatsapp", "https://graph.test/x", { method: "POST" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.retryable).toBe(true);
      expect(res.error.message).toContain("ECONNRESET");
    }
  }, 30_000);

  it("espacia las llamadas del mismo canal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));

    const started = Date.now();
    await graphFetch("whatsapp", "https://graph.test/a", { method: "POST" });
    await graphFetch("whatsapp", "https://graph.test/b", { method: "POST" });
    const elapsed = Date.now() - started;

    // El hueco mínimo de WhatsApp es 125 ms; con margen para el reloj del CI.
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });
});
