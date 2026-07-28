import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Una sola conexión reutilizada entre hot reloads de Next en desarrollo.
const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDb.sql ??
  postgres(env.DATABASE_URL, {
    max: process.env.NODE_ENV === "production" ? 10 : 3,
    idle_timeout: 20,
    // Neon/Supabase exigen SSL; Postgres local no.
    ssl: env.DATABASE_URL.includes("sslmode=require") ? "require" : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
export * from "./schema";
