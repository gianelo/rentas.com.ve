import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * D5 (design.md): "zone has UNIQUE (id, city_id); listing carries a
 * composite foreign key (zone_id, city_id) -> zone(id, city_id). A
 * Maracaibo listing physically cannot hold a Distrito Capital zone."
 *
 * `listing` itself is PR3's work (tasks.md 3.1) and does not exist yet.
 * Proving the constraint PR2 actually ships — zone's own
 * `UNIQUE(id, city_id)` — needs *some* table that references it with a
 * composite foreign key, because a primary key on `id` alone is already
 * unique regardless of `city_id`; the compound uniqueness only becomes
 * observable once something targets it. Building the whole `listing` table
 * here to prove one constraint would pull PR3's schema forward and outgrow
 * this slice's budget for no benefit, so this test creates the smallest
 * possible probe table instead — one row, three columns, the exact
 * composite FK shape `listing` will carry — scoped to this test file and
 * dropped afterwards. It is not part of src/shared/db/schema.ts and ships
 * no migration: it exists only to observe Postgres enforcing the real
 * constraint that does ship.
 *
 * This MUST run against real Postgres, not an emulator or a fake repository
 * (design.md, Testing Strategy): the guarantee lives in a database
 * constraint, so only the database can refuse the write. A unit test with
 * an in-memory port fake would prove that application code declined to
 * try, which is not what D5 promises.
 */

function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. This integration test needs a real Postgres " +
        'instance (see .github/workflows/ci.yml\'s "integration" job, which starts one ' +
        "automatically) — or run one locally, e.g. " +
        "`docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:18` and " +
        "export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres.",
    );
  }
  return url;
}

const PROBE_TABLE = "zone_reference_probe_d5";

describe("D5 city isolation — zone.UNIQUE(id, city_id)", () => {
  const client = new Client({ connectionString: getTestDatabaseUrl() });

  beforeAll(async () => {
    await client.connect();
    // Requires zone's UNIQUE(id, city_id) to exist at all — Postgres
    // refuses to create this FK otherwise ("there is no unique constraint
    // matching given keys for referenced table"), which is itself evidence
    // the constraint is load-bearing, not decorative.
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${PROBE_TABLE}" (
        id text PRIMARY KEY,
        zone_id text NOT NULL,
        city_id text NOT NULL,
        FOREIGN KEY (zone_id, city_id) REFERENCES "zone" (id, city_id)
      );
    `);
  });

  afterAll(async () => {
    await client.query(`DROP TABLE IF EXISTS "${PROBE_TABLE}";`);
    await client.end();
  });

  it("rejects a probe row whose city_id does not match its zone's real city", async () => {
    const capitalId = randomUUID();
    const maracaiboId = randomUUID();
    const zoneId = randomUUID();

    await client.query('INSERT INTO "city" (id, name) VALUES ($1, $2), ($3, $4)', [
      capitalId,
      `Distrito Capital ${capitalId}`,
      maracaiboId,
      `Maracaibo ${maracaiboId}`,
    ]);
    await client.query('INSERT INTO "zone" (id, city_id, name) VALUES ($1, $2, $3)', [
      zoneId,
      capitalId,
      `Chacao ${zoneId}`,
    ]);

    // The cross-city reference: this zone genuinely belongs to `capitalId`,
    // so pairing it with `maracaiboId` is exactly the row D5 says must be
    // unrepresentable. Postgres, not application code, must refuse it.
    await expect(
      client.query(`INSERT INTO "${PROBE_TABLE}" (id, zone_id, city_id) VALUES ($1, $2, $3)`, [
        randomUUID(),
        zoneId,
        maracaiboId,
      ]),
    ).rejects.toMatchObject({ code: "23503" }); // foreign_key_violation

    // Sanity check: the same zone paired with its real city succeeds, which
    // is what proves the rejection above is about the city mismatch and not
    // a malformed query or a missing table.
    await expect(
      client.query(`INSERT INTO "${PROBE_TABLE}" (id, zone_id, city_id) VALUES ($1, $2, $3)`, [
        randomUUID(),
        zoneId,
        capitalId,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
  });
});
