import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// .env.local manda en desarrollo; .env es el de producción/Docker.
config({ path: ".env.local" });
config({ path: ".env" });

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
