import { cache } from "react";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Cliente de base de datos.
 *
 * En Cloudflare Workers no hay proceso largo: cada petición corre en su propio
 * aislamiento y reutilizar una conexión entre peticiones falla. Por eso el pool
 * se crea por petición con `maxUses: 1`, y `cache()` de React lo comparte
 * dentro de la misma petición. Las conexiones reales las agrupa Hyperdrive del
 * lado de Cloudflare: eso es lo que evita agotar el cupo de Neon.
 *
 * Se sigue exportando `db` mediante un Proxy para no reescribir las 20 rutas
 * que lo importan: la resolución del cliente pasa a ser perezosa y el código
 * que llama no cambia.
 *
 * Fuera de Workers (next dev, scripts, tests) cae a `DATABASE_URL`.
 */

interface HyperdriveBinding {
  connectionString: string;
}

/** El binding solo existe corriendo dentro de Workers. */
function hyperdriveConnectionString(): string | null {
  try {
    // Carga perezosa: en Node el módulo del adaptador no debe evaluarse.
    const mod = require("@opennextjs/cloudflare") as {
      getCloudflareContext?: () => { env?: Record<string, unknown> };
    };

    const env = mod.getCloudflareContext?.()?.env;
    const hyperdrive = env?.HYPERDRIVE as HyperdriveBinding | undefined;

    return hyperdrive?.connectionString ?? null;
  } catch {
    // No estamos en Workers, o el contexto todavía no está disponible.
    return null;
  }
}

function connectionString(): string {
  const fromHyperdrive = hyperdriveConnectionString();
  if (fromHyperdrive) return fromHyperdrive;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Sin conexión a la base de datos: no hay binding HYPERDRIVE ni DATABASE_URL."
    );
  }
  return url;
}

type Database = ReturnType<typeof drizzle<typeof schema>>;

/** Un cliente por petición; `cache()` lo deduplica dentro de la misma. */
const getDb = cache((): Database => {
  const url = connectionString();

  const pool = new Pool({
    connectionString: url,
    // Cada conexión sirve a una sola petición: reutilizarlas entre
    // aislamientos de Workers es exactamente lo que rompe.
    maxUses: 1,
    max: 1,
    // Hyperdrive ya habla TLS con el origen; conectando directo a Neon sí hace falta.
    ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });

  return drizzle({ client: pool, schema });
});

/**
 * El mismo `db` de siempre para quien lo importa, resuelto al vuelo.
 * Los métodos se enlazan al cliente real: Drizzle usa `this` internamente y
 * llamarlos sobre el Proxy los rompería.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const client = getDb();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { schema };
export * from "./schema";
