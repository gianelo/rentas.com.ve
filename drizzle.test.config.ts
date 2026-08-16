import { defineConfig } from "drizzle-kit";

/**
 * A second Drizzle config that exists for one reason: `drizzle.config.ts`
 * reads `DATABASE_URL`, which is the real database. A `db:test:migrate`
 * script pointed at that config would migrate production the moment someone
 * ran it with their normal `.env` loaded — and it would look like it worked.
 *
 * This config reads `TEST_DATABASE_URL` only, and refuses to run when it is
 * unset rather than falling back to anything. Same principle the rest of the
 * codebase runs on: make the unsafe call unrepresentable instead of asking
 * the caller to remember which config to pass.
 */
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error(
    "TEST_DATABASE_URL is not set. This config only ever migrates the disposable " +
      "test database — start it with `pnpm db:test:up` and set " +
      "TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/rentas_test in .env. " +
      "It deliberately does not fall back to DATABASE_URL, which is the real database.",
  );
}

export default defineConfig({
  schema: "./src/shared/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
