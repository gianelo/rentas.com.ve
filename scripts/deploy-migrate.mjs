#!/usr/bin/env node
/**
 * Applies pending migrations before the deployment that needs them is built.
 *
 * **This exists because production ran four migrations behind for four days
 * and nothing said so.** `build` was `next build` and nothing else, so no
 * deploy had ever touched the database. Search kept working — it selects
 * none of the missing columns — while signing in failed on
 * `column "contact_method" does not exist` and publishing was impossible
 * because `listing_photo` did not exist at all. The founder found it by
 * trying to log in to his own product.
 *
 * A logger would not have caught this. The error WAS written; nobody was
 * reading. What closes the hole is making the schema arrive with the code
 * that expects it, which is what this does.
 *
 * **Production only, deliberately.** Preview deployments are skipped until
 * each one has its own Neon branch (see .github/workflows/ci.yml's header).
 * Until then a preview's DATABASE_URL is the production database, and a
 * preview build of an unmerged branch would apply that branch's migrations
 * to live data — a NOT NULL column arriving before the code that fills it.
 * The skip is printed rather than silent, so a preview that renders against
 * a stale schema is explainable instead of mysterious.
 */

import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const environment = process.env.VERCEL_ENV ?? "local";

if (environment !== "production") {
  console.log(
    `deploy-migrate: skipped — VERCEL_ENV is "${environment}", not "production".\n` +
      "deploy-migrate: preview deployments share the production database until each\n" +
      "deploy-migrate: gets its own Neon branch, and migrating it from an unmerged\n" +
      "deploy-migrate: branch would change live data ahead of the code that reads it.",
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  // A failure, not a skip. A production build that cannot reach its database
  // is a build that would deploy code against an unknown schema, and that is
  // precisely the state this script exists to make impossible.
  console.error("deploy-migrate: DATABASE_URL is not set on the production environment.");
  process.exit(1);
}

/**
 * **A migration must never destroy real data**, and this is a gate rather
 * than a promise (founder, 2026-08-20). All eight migrations were audited
 * clean when this was written, so the first destructive statement anyone
 * generates stops a deploy instead of running against the catalogue.
 *
 * `drizzle-kit` does not have to be told to be destructive — removing a
 * field from schema.ts is enough for it to emit `DROP COLUMN`, and that is
 * a one-line diff whose consequence is invisible in review.
 *
 * Every migration file is scanned, not only the pending ones. An applied
 * migration will not run again, so the extra scanning costs nothing, and it
 * means the check needs no connection to decide.
 */
const DESTRUCTIVE = [
  /\bDROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
];

const migrationsDirectory = join(process.cwd(), "drizzle");
const offences = [];

for (const file of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql"))) {
  // Comments are stripped first. Several migrations EXPLAIN a destructive
  // statement they deliberately avoided -- 0006 and 0007 both describe the
  // `ADD COLUMN NOT NULL` that Postgres refuses -- and a guard that fired on
  // prose would be a guard everyone learns to bypass.
  const sql = readFileSync(join(migrationsDirectory, file), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  for (const pattern of DESTRUCTIVE) {
    if (pattern.test(sql)) offences.push(`${file}: ${pattern.source}`);
  }
}

if (offences.length > 0 && !process.env.ALLOW_DESTRUCTIVE_MIGRATION) {
  console.error(
    "deploy-migrate: REFUSING TO MIGRATE — a migration would destroy data.\n\n" +
      offences.map((offence) => `  ${offence}`).join("\n") +
      "\n\nThis database holds real listings published by real people. If the\n" +
      "statement is genuinely intended, set ALLOW_DESTRUCTIVE_MIGRATION=1 on the\n" +
      "production environment for that one deploy and take a backup first.",
  );
  process.exit(1);
}

console.log(
  `deploy-migrate: ${offences.length === 0 ? "no destructive statements found" : "destructive statements ALLOWED by override"}.`,
);
console.log("deploy-migrate: applying pending migrations to production…");
execSync("pnpm drizzle-kit migrate", { stdio: "inherit" });
console.log("deploy-migrate: schema is up to date.");
