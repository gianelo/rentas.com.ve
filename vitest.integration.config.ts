import { defineConfig } from "vitest/config";

// Integration layer (design.md, "Testing Strategy"): Drizzle queries and
// Postgres-specific behaviour (composite FKs, bit_count Hamming distance,
// the contact_reveal_unique_pair view) run against a real Postgres
// container — never an emulator (see CI's `integration` job). Specs live
// under tests/integration/, not src/, so vitest.config.ts's
// src/**/*.test.ts glob never picks them up and `pnpm test:unit` never
// silently starts needing a database.
//
// Vitest does NOT read `.env` into `process.env` on its own — Vite only
// exposes `VITE_`-prefixed values, and only to `import.meta.env`. Without
// the block below, putting TEST_DATABASE_URL in `.env` looks like it should
// work and does nothing: the suite fails on its own precondition guard with
// the variable sitting right there in the file.
//
// `process.loadEnvFile` is Node's own parser (built in since v20.12), so
// this needs no dotenv dependency and no hand-rolled quoting rules.
//
// A value already present in the real environment MUST WIN over `.env`, so
// the pre-existing values are captured and restored afterwards. CI depends
// on this: its `integration` job points TEST_DATABASE_URL at the service
// container, and a committed `.env` must never be able to redirect it.
{
  const realEnv = { ...process.env };
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env — normal in CI, where the values come from the environment.
  }
  for (const [key, value] of Object.entries(realEnv)) {
    if (value !== undefined) process.env[key] = value;
  }
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
  },
});
