#!/usr/bin/env node
/**
 * One command that runs what CI runs.
 *
 * **This exists because of a process failure, not a missing convenience.**
 * There was no single local gate, so every push assembled the list by hand —
 * and the one that kept falling off was `integration`, because it needs
 * Docker and Docker was not running. Three pull requests in a row went up
 * green locally and red in CI, and the founder found each of them.
 *
 * Two rules give this file whatever value it has:
 *
 * 1. **It cannot skip.** A gate that cannot run is a FAILURE here, never a
 *    warning and never a silent pass. That is the same lesson as the empty
 *    `tests/e2e/` directory, `--passWithNoTests`, and an e2e job that
 *    reported green while proving nothing: a gate that cannot fail is worse
 *    than no gate, because it spends time and buys confidence it has not
 *    earned.
 * 2. **The order is load-bearing.** `test:measure` starts a dev server that
 *    overwrites `.next`, so `budget:bundle` reading it afterwards measured a
 *    development bundle and reported 1,854,100 bytes. Measure runs first;
 *    the production build comes after it; budget and e2e then share that
 *    one build.
 */

import { execSync, spawn, spawnSync } from "node:child_process";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/rentas_test";

// 5433, not 5432. The compose file maps it there deliberately, to leave a
// natively installed Postgres alone rather than silently shadowing it — and
// pointing at 5432 produces a drizzle-kit failure with NO error text at all,
// which cost twenty minutes the first time.
const args = new Set(process.argv.slice(2));
const skipSlow = args.has("--fast");

function run(name, command, env = {}) {
  process.stdout.write(`\n\x1b[1m▸ ${name}\x1b[0m\n`);
  const started = Date.now();
  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  return { name, ok: result.status === 0, seconds };
}

/**
 * Started here rather than assumed. `pnpm test:integration` against an
 * absent database fails with a connection error that reads like a broken
 * test, and the actual instruction — start the container — is nowhere in it.
 */
function ensurePostgres() {
  try {
    execSync("docker info", { stdio: "ignore" });
  } catch {
    console.error(
      "\n\x1b[31mDocker is not running.\x1b[0m The integration layer proves guarantees that " +
        "live in Postgres itself — D5's composite foreign key, D4's bit_count distance — so " +
        "there is no version of this suite that runs without it.\n\n" +
        "  open -a Docker    (then re-run)\n\n" +
        "This is a failure rather than a skip on purpose: the last three pull requests were " +
        "pushed green locally and went red in CI on exactly this job.",
    );
    process.exit(1);
  }
  execSync("pnpm db:test:up", { stdio: "inherit" });

  // **Dropped and recreated, every run.** CI gets a fresh service container;
  // this one survives, and a database that outlives the branch is worse than
  // no database. Switching from a branch that adds a NOT NULL column back to
  // one that does not leaves the column behind, and every fixture on the
  // older branch then fails on 23502 -- a red describing nothing true about
  // the code under test. The reverse is the dangerous direction: a dropped
  // column that lingers lets a query keep passing against a shape the
  // migrations no longer produce.
  //
  // Guarded on the local container's own address, so an overridden
  // TEST_DATABASE_URL pointing anywhere else is never dropped.
  if (TEST_DATABASE_URL.includes("localhost:5433")) {
    const psql = "docker exec rentas-pg psql -U postgres -d postgres -c";
    execSync(`${psql} 'DROP DATABASE IF EXISTS rentas_test WITH (FORCE)'`, { stdio: "ignore" });
    execSync(`${psql} 'CREATE DATABASE rentas_test'`, { stdio: "ignore" });
  }

  execSync("pnpm db:test:migrate", {
    stdio: "inherit",
    env: { ...process.env, TEST_DATABASE_URL },
  });
}

/**
 * The e2e step serves its own build rather than letting Playwright's
 * `webServer` do it, for two reasons this script's own runs produced.
 *
 * **A stale server gets reused.** `reuseExistingServer: !CI` means that
 * outside CI Playwright attaches to whatever already answers on 3000 -- and
 * a `pnpm start` left over from an earlier run serves an earlier build. Two
 * of those were alive here, and the suite spent a full run reporting
 * failures about code that was not being served.
 *
 * **The root spec skips for the wrong reason.** It skips when no
 * `PLAYWRIGHT_BASE_URL` is set, which in CI correctly means "no database" --
 * but locally there IS a real database, from .env, and the read path is
 * exactly what most deserves proving before a push. Starting the server here
 * and naming its address makes the spec run.
 */
async function runE2E() {
  // `-sTCP:LISTEN` is the whole fix. Without it `lsof -ti:3000` reports every
  // process that has TOUCHED the port, clients included — and this script is
  // one, because it polls the server with `fetch` below. So `xargs kill -9`
  // killed verify itself, between the last gate and the summary: no table,
  // and exit 0 no matter what had failed. Twice diagnosed wrongly before
  // this: the process-group kill was a real bug but not this one.
  execSync("lsof -ti:3000 -sTCP:LISTEN | xargs kill -9 || true", { shell: true, stdio: "ignore" });

  const server = spawn("pnpm", ["start"], { detached: true, stdio: "ignore" });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      ready = await fetch("http://localhost:3000/")
        .then((response) => response.ok)
        .catch(() => false);
    }
    if (!ready) {
      // A failure, never a skip: an e2e gate that cannot reach the app has
      // proven nothing, and reporting that as anything but red is the exact
      // habit this file exists to break.
      console.error("\x1b[31mThe production server never answered on :3000.\x1b[0m");
      return { name: "e2e + crawlability", ok: false, seconds: "0.0" };
    }
    return run("e2e + crawlability", "pnpm exec playwright test", {
      PLAYWRIGHT_BASE_URL: "http://localhost:3000",
    });
  } finally {
    // `server.kill()`, never `process.kill(-server.pid)`. The negative form
    // signals a process GROUP, and when the child does not end up leading
    // its own group that group is this script's -- so verify killed itself
    // between the last gate and the summary. It printed no table and exited
    // 0 whatever had failed, which is the one thing this file exists to
    // prevent. The port sweep below still catches any orphan.
    server.kill("SIGKILL");
    execSync("lsof -ti:3000 -sTCP:LISTEN | xargs kill -9 || true", {
      shell: true,
      stdio: "ignore",
    });
  }
}

const results = [];

results.push(run("lint", "pnpm exec biome ci ."));
results.push(run("types", "pnpm typecheck"));
results.push(run("lint-tokens", "pnpm lint:tokens"));
results.push(run("test + coverage floor", "pnpm test:coverage"));

ensurePostgres();
results.push(run("integration", "pnpm test:integration", { TEST_DATABASE_URL }));

if (skipSlow) {
  console.log("\n\x1b[33m--fast: measure, build, budget and e2e were NOT run.\x1b[0m");
  console.log("They are the four gates that need a browser or a build. Do not push on --fast.");
} else {
  // Before the production build, because its dev server overwrites `.next`.
  results.push(run("measure", "pnpm test:measure"));
  // **`rm -rf` is the load-bearing half, and ordering alone was not enough.**
  // `next dev` and `next build` write DIFFERENT artefacts into the same
  // directory, and building over a development `.next` produces a server that
  // starts, serves every route as 500, and says only
  // `TypeError: a[d] is not a function`.
  //
  // Found by this script's own first run, and the detail worth keeping is
  // which gate stayed quiet: `budget` reported PASS against that build. It
  // measured a bundle that could not serve a single page.
  results.push(run("build", "rm -rf .next && pnpm build"));
  // Both read the build above rather than making their own.
  results.push(run("budget", "pnpm budget:bundle"));
  results.push(await runE2E());
}

const failed = results.filter((result) => !result.ok);

console.log(`\n\x1b[1m${"─".repeat(46)}\x1b[0m`);
for (const { name, ok, seconds } of results) {
  console.log(
    `  ${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}  ${name.padEnd(26)} ${seconds}s`,
  );
}

if (failed.length > 0) {
  console.error(`\n\x1b[31m${failed.length} gate(s) failed.\x1b[0m Do not push.`);
  process.exit(1);
}
console.log(`\n\x1b[32mEvery gate CI runs passed locally.\x1b[0m`);
