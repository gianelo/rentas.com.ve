import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SeedDatabase, seed } from "../../src/shared/db/seed";

const execFileAsync = promisify(execFile);

/**
 * The seed populates the Vercel Preview environment on every deploy — it is
 * the only thing that puts rows in that Neon branch, so a preview showing an
 * empty catalogue and a preview whose seed silently failed look identical.
 * Until this file existed the script could not run anywhere but the real
 * database, which meant its first genuine execution was always production-
 * shaped. That is why `seed()` takes a database handle.
 *
 * Driven through `drizzle-orm/node-postgres` rather than the app's
 * `neon-http` client: same Drizzle query builder and the same SQL, against
 * the disposable container. It is the driver that differs, not the
 * statements being proven.
 */

function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start the disposable database with " +
        "`pnpm db:test:up && pnpm db:test:migrate`.",
    );
  }
  return url;
}

const client = new Client({ connectionString: getTestDatabaseUrl() });
const database = drizzle(client) as unknown as SeedDatabase;

async function countRows(table: string): Promise<number> {
  const result = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
  return result.rows[0].n as number;
}

describe("seed", () => {
  beforeAll(async () => {
    await client.connect();
    // A clean slate, because the assertions below are exact counts. Order
    // matters: listing references user, zone and city.
    await client.query('DELETE FROM "listing"');
    await client.query('DELETE FROM "zone"');
    await client.query('DELETE FROM "city"');
    await client.query(`DELETE FROM "user" WHERE email LIKE '%@rentas.invalid'`);
    await seed(database);
  });

  afterAll(async () => {
    await client.end();
  });

  it("populates the full taxonomy and catalogue", async () => {
    expect(await countRows("city")).toBe(2);
    expect(await countRows("zone")).toBe(10);
    expect(await countRows("listing")).toBe(10);
  });

  it("keeps every listing inside its own city (D5, enforced by the schema)", async () => {
    // If the composite foreign key were ever dropped, the seed would still
    // insert and this count would rise above zero rather than the insert
    // failing — so it is asserted rather than assumed.
    const result = await client.query(`
      SELECT count(*)::int AS n
        FROM "listing" l
        JOIN "zone" z ON z.id = l.zone_id
       WHERE z.city_id <> l.city_id
    `);
    expect(result.rows[0].n).toBe(0);
  });

  it("ships both publisher types, so the greyscale badge stays testable", async () => {
    const result = await client.query(
      `SELECT publisher_type, count(*)::int AS n FROM "listing" GROUP BY publisher_type ORDER BY publisher_type`,
    );
    const byType = Object.fromEntries(result.rows.map((r) => [r.publisher_type, r.n]));
    expect(byType.owner).toBeGreaterThan(0);
    expect(byType.broker).toBeGreaterThan(0);
  });

  it("prices every listing inside the design's $250–$900 band", async () => {
    const result = await client.query(
      `SELECT min(price_usd)::int AS lo, max(price_usd)::int AS hi FROM "listing"`,
    );
    expect(result.rows[0].lo).toBeGreaterThanOrEqual(250);
    expect(result.rows[0].hi).toBeLessThanOrEqual(900);
  });

  it("publishes every listing active and unexpired, or the preview looks broken", async () => {
    const result = await client.query(
      `SELECT count(*)::int AS n FROM "listing" WHERE status <> 'active' OR expires_at <= now()`,
    );
    expect(result.rows[0].n).toBe(0);
  });

  it("is idempotent — a second run duplicates nothing", async () => {
    // The real failure this guards against: the seed runs on EVERY preview
    // deploy. A non-idempotent seed would not fail loudly, it would quietly
    // grow the catalogue by ten listings per push until the numbers on the
    // screen stopped meaning anything.
    await seed(database);

    expect(await countRows("city")).toBe(2);
    expect(await countRows("zone")).toBe(10);
    expect(await countRows("listing")).toBe(10);
  });

  /**
   * REGRESSION GUARD, and the bug it guards against already shipped once.
   *
   * `seed()` takes a database handle so it can run without the real client.
   * The first attempt wrote that as `seed(database: SeedDatabase = db)` with
   * a plain `import { db } from "./client"` — which does not work, because
   * `./client` resolves DATABASE_URL at MODULE scope. The default parameter
   * is evaluated at call time, but the import that produces it runs at load
   * time, so merely importing this module threw. The injection was
   * cosmetic.
   *
   * It passed locally and failed in CI, for one reason: a local `.env`
   * supplies DATABASE_URL and CI supplies only TEST_DATABASE_URL. That is
   * also why this test must spawn a CHILD PROCESS. Inside the vitest run,
   * `vitest.integration.config.ts` has already loaded `.env` into
   * process.env, so an in-process assertion would be checking a world where
   * the variable exists — it would pass no matter how the import is written,
   * and reproduce the exact blindness that let the bug through.
   */
  it("can be imported with no DATABASE_URL, so it is testable without the real database", async () => {
    const { DATABASE_URL, ...envWithoutDatabaseUrl } = process.env;
    const { stdout } = await execFileAsync(
      "pnpm",
      [
        "exec",
        "tsx",
        "-e",
        'import("./src/shared/db/seed.ts").then(() => console.log("IMPORT_OK"))',
      ],
      { env: envWithoutDatabaseUrl, cwd: process.cwd() },
    );

    expect(stdout).toContain("IMPORT_OK");
  }, 60_000);

  it("still refuses to run against the real client when DATABASE_URL is absent", async () => {
    // The other half of the contract: making the module importable must not
    // have softened the guard. A seed that silently no-ops without a
    // database would be worse than one that throws.
    const { DATABASE_URL, ...envWithoutDatabaseUrl } = process.env;

    await expect(
      execFileAsync(
        "pnpm",
        ["exec", "tsx", "-e", 'import("./src/shared/db/seed.ts").then((m) => m.seed())'],
        { env: envWithoutDatabaseUrl, cwd: process.cwd() },
      ),
    ).rejects.toThrow(/DATABASE_URL environment variable is not set/);
  }, 60_000);

  it("refreshes the expiry window on re-run so a seeded catalogue never ages out", async () => {
    await client.query(
      `UPDATE "listing" SET expires_at = now() - interval '1 day', status = 'active'`,
    );
    await seed(database);

    const result = await database
      .select({ stale: sql<number>`count(*) FILTER (WHERE expires_at <= now())::int` })
      .from(sql`"listing"`);
    expect(result[0]?.stale).toBe(0);
  });
});
