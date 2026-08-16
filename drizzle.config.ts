import { defineConfig } from "drizzle-kit";

// drizzle-kit's CLI loads `.env` automatically; no explicit dotenv import
// needed here. DATABASE_URL must be Neon's pooled connection string (see
// src/shared/db/pooled-connection.ts) — drizzle-kit itself only generates
// and applies SQL, so it cannot enforce that; the app runtime client does.
export default defineConfig({
  schema: "./src/shared/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
