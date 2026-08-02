// @ts-ignore — `.open-next/worker.js` lo genera `opennextjs-cloudflare build`,
// así que no existe en el árbol de fuentes ni cuando corre `tsc --noEmit`.
import { default as handler } from "./.open-next/worker.js";

/**
 * Punto de entrada del Worker.
 *
 * El worker que genera OpenNext solo exporta `fetch`. Cloudflare necesita un
 * handler `scheduled` para los Cron Triggers, así que se envuelve: el `fetch`
 * de Next se reutiliza tal cual y se añade el drenado de la cola de salida.
 *
 * Antes esto era un cron externo pegándole a /api/cron/outbox con CRON_SECRET.
 * Aquí la invocación viene del runtime de Cloudflare, no de internet: no hay
 * URL pública que proteger ni secreto que rotar. La ruta HTTP se conserva para
 * poder dispararlo a mano y para no atar el código a un solo proveedor.
 */

/**
 * Tipos mínimos del runtime de Workers. Se declaran aquí en vez de importar
 * `@cloudflare/workers-types` porque esos tipos son globales y reemplazan los
 * del DOM, rompiendo el tipado de los componentes de React.
 */
interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  fetch: handler.fetch,

  async scheduled(_event: ScheduledEvent, _env: unknown, ctx: WorkerContext) {
    // Import dinámico: el módulo abre la conexión a la base y no debe
    // evaluarse mientras se construye el worker.
    const { drainOutbox } = await import("./src/lib/messaging/outbox");

    // waitUntil evita que el aislamiento muera con el drenado a medias.
    ctx.waitUntil(
      drainOutbox()
        .then((r) => {
          if (r.processed > 0) {
            console.log(
              `[cron:outbox] ${r.processed} procesados · ${r.sent} enviados · ` +
                `${r.requeued} reencolados · ${r.failed} fallidos · ${r.blocked} bloqueados`
            );
          }
        })
        .catch((e) => {
          // Que falle el cron no debe tumbar nada: la siguiente corrida vuelve
          // a tomar las mismas filas.
          console.error("[cron:outbox] Error drenando la cola:", e);
        })
    );
  },
};
