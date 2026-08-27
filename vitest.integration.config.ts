import { fileURLToPath } from "node:url";
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
  // Mirrors tsconfig.json's "@/*" -> "./src/*" alias, the same way
  // vitest.config.ts already does. It did not exist here until a spec needed
  // to exercise a **server action** against the real database (tasks.md 8.7):
  // the action under `app/` imports its use case and its adapters through
  // `@/`, and without this the suite cannot reach the code a browser actually
  // runs — only the use case underneath it, which is exactly the seam where
  // this project has now found five unreachable use cases.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Every file here shares ONE database, and `seed.test.ts` legitimately
    // wipes `city`, `zone` and `listing` in its own `beforeAll` — testing an
    // idempotent seed requires a clean slate. Run in parallel, that DELETE
    // lands in the middle of another file's fixtures.
    //
    // **This suite was already racy; task 3.13 only made it visible**, by
    // being the first file to insert a city and then use it across several
    // specs. The others happened to finish inside the window. A test that
    // passes because of timing is not a passing test, so the fix is
    // structural rather than a retry or a sleep: one database, one file at a
    // time. The cost is a few seconds on a four-file suite.
    fileParallelism: false,
  },
});
