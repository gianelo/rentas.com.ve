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

console.log("deploy-migrate: applying pending migrations to production…");
execSync("pnpm drizzle-kit migrate", { stdio: "inherit" });
console.log("deploy-migrate: schema is up to date.");
