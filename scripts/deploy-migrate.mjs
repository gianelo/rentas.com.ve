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
 * Every migration file is scanned, not only the pending ones. The original
 * note here said that scanning applied migrations "costs nothing". **That was
 * wrong, and it cost a three-hour production outage on 2026-08-22.** Migration
 * 0010 legitimately drops four columns — after copying every value into the
 * table that replaces them — and from the minute it merged, EVERY production
 * deploy died before `next build` ran. The gate was working; what was missing
 * was a way to say "this one was looked at".
 *
 * **That way is a marker inside the migration itself**, not an environment
 * variable:
 *
 *     -- deploy-migrate: allow-destructive — <why the data survives>
 *
 * The marker travels with the file, appears in the diff that introduces the
 * `DROP`, and has to be written by hand with a reason. An environment variable
 * is invisible in review, is set once and forgotten, and disarms the gate for
 * every migration that comes after it. The marker disarms exactly one file.
 *
 * `ALLOW_DESTRUCTIVE_MIGRATION` stays as the emergency hatch for a migration
 * nobody can edit any more.
 */
const DESTRUCTIVE = [
  /\bDROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
];

/**
 * The marker, and the reason it demands prose after the dash: a bare
 * `allow-destructive` is a checkbox, and a checkbox gets ticked. A sentence
 * has to be written by somebody who looked at the statement.
 */
const ALLOWANCE = /^\s*--\s*deploy-migrate:\s*allow-destructive\s*[—-]\s*(\S.*)$/im;

const migrationsDirectory = join(process.cwd(), "drizzle");
const offences = [];
const reviewed = [];

for (const file of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql"))) {
  const raw = readFileSync(join(migrationsDirectory, file), "utf8");

  // Comments are stripped first. Several migrations EXPLAIN a destructive
  // statement they deliberately avoided -- 0006 and 0007 both describe the
  // `ADD COLUMN NOT NULL` that Postgres refuses -- and a guard that fired on
  // prose would be a guard everyone learns to bypass.
  const sql = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  const matched = DESTRUCTIVE.filter((pattern) => pattern.test(sql));
  if (matched.length === 0) continue;

  // The allowance is read from the RAW file, because it lives in a comment.
  const allowance = ALLOWANCE.exec(raw);
  if (allowance) {
    reviewed.push(`${file}: ${allowance[1].trim()}`);
    continue;
  }

  for (const pattern of matched) offences.push(`${file}: ${pattern.source}`);
}

// Printed whether or not anything is blocked. A destructive migration that
// runs in silence is the thing this script exists to prevent, and "it was
// reviewed" is only worth something if the review is visible in the log.
for (const note of reviewed) {
  console.log(`deploy-migrate: destructive statement ALLOWED by marker — ${note}`);
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
  offences.length > 0
    ? "deploy-migrate: destructive statements ALLOWED by ALLOW_DESTRUCTIVE_MIGRATION."
    : reviewed.length > 0
      ? `deploy-migrate: ${reviewed.length} reviewed destructive migration(s), none unreviewed.`
      : "deploy-migrate: no destructive statements found.",
);
console.log("deploy-migrate: applying pending migrations to production…");
execSync("pnpm drizzle-kit migrate", { stdio: "inherit" });

// **"Up to date" is drizzle-kit's opinion, and 11b.5 exists because an
// opinion is not a check.** `_journal.json` says which files ran; it cannot
// say whether the database now holds the columns this code selects. A schema
// generated on a branch, a migration applied by hand, a `_journal` restored
// from a backup -- each leaves the journal happy and the deploy broken in
// exactly the way that cost four days: search keeps working because it selects
// none of the missing columns, and signing in dies on `column
// "contact_method" does not exist`.
//
// Called from here rather than from `vercel-build` so there is ONE entry point
// and two questions: may we migrate, and did the migration leave the schema the
// code expects. It exits non-zero on its own, so `execSync` stops the build.
console.log("deploy-migrate: verifying the schema matches the code…");
execSync("pnpm tsx scripts/schema-smoke.ts", { stdio: "inherit" });
