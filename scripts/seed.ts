/**
 * Etapas iniciales del pipeline y respuestas rápidas. Idempotente: se puede
 * correr varias veces.
 *   npm run db:seed
 *
 * Standalone a propósito: no usa el alias "@/" para no depender de la
 * resolución de paths de Next fuera del bundler.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { quickReplies, stages } from "../src/lib/db/schema";

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

/** Punto de partida editable. channel null = sirve en los tres canales. */
const DEFAULT_QUICK_REPLIES = [
  {
    title: "Saludo",
    body: "¡Hola! Gracias por escribirnos. ¿En qué te podemos ayudar?",
    position: 1,
  },
  {
    title: "Pedir datos",
    body: "Para armarte la cotización necesito tu nombre completo y la ciudad de entrega.",
    position: 2,
  },
  {
    title: "Seguimiento",
    body: "Te escribo para dar seguimiento a tu cotización. ¿Sigues interesado?",
    position: 3,
  },
  {
    title: "Baja",
    body: "Listo, no volveremos a escribirte. Si cambias de opinión, aquí estamos.",
    position: 4,
  },
];

async function main() {
  const sql = postgres(url!, { max: 1 });
  const db = drizzle(sql);

  for (const stage of DEFAULT_STAGES) {
    await db.insert(stages).values(stage).onConflictDoNothing();
  }

  // Solo se siembran si la tabla está vacía: no pisar lo que edite el equipo.
  const existing = await db.select({ id: quickReplies.id }).from(quickReplies).limit(1);
  if (existing.length === 0) {
    await db.insert(quickReplies).values(DEFAULT_QUICK_REPLIES);
  }

  console.log(
    `✅ ${DEFAULT_STAGES.length} etapas listas` +
      (existing.length === 0
        ? ` · ${DEFAULT_QUICK_REPLIES.length} respuestas rápidas creadas`
        : " · respuestas rápidas ya existían")
  );
  await sql.end();
}

main().catch((e) => {
  console.error("❌ Error en el seed:", e);
  process.exit(1);
});
