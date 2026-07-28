/**
 * Etapas iniciales del pipeline. Idempotente: se puede correr varias veces.
 *   npm run db:seed
 *
 * Standalone a propósito: no usa el alias "@/" para no depender de la
 * resolución de paths de Next fuera del bundler.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { stages } from "../src/lib/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ Falta DATABASE_URL (revisa .env.local)");
  process.exit(1);
}

const DEFAULT_STAGES = [
  { key: "nuevo", name: "Nuevo", position: 1, color: "slate" },
  { key: "contactado", name: "Contactado", position: 2, color: "blue" },
  { key: "calificado", name: "Calificado", position: 3, color: "violet" },
  { key: "propuesta", name: "Propuesta", position: 4, color: "amber" },
  { key: "ganado", name: "Ganado", position: 5, color: "emerald", isWon: true },
  { key: "perdido", name: "Perdido", position: 6, color: "red", isLost: true },
];

async function main() {
  const sql = postgres(url!, { max: 1 });
  const db = drizzle(sql);

  for (const stage of DEFAULT_STAGES) {
    await db.insert(stages).values(stage).onConflictDoNothing();
  }

  console.log(`✅ ${DEFAULT_STAGES.length} etapas listas`);
  await sql.end();
}

main().catch((e) => {
  console.error("❌ Error en el seed:", e);
  process.exit(1);
});
