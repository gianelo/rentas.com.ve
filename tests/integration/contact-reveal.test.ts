import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ContactRevealDatabase,
  DrizzleContactRevealEvents,
  DrizzleContactRevealMetrics,
} from "../../src/modules/contact-reveal/infrastructure/drizzle-contact-reveal";
import * as schema from "../../src/shared/db/schema";

/**
 * Task 6.6 — the north-star metric against real Postgres.
 *
 * This is the one assertion no in-memory fake can make. D6 splits the metric
 * across a table and a view: the table keeps every reveal action, the view
 * collapses them to unique `(tenant, listing)` pairs. Both halves are SQL,
 * and if `DISTINCT ON` or the window `count(*)` is wrong the product reports
 * a confident wrong number to its own go/pivot decision six months from now —
 * the single most expensive way this codebase can be wrong.
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

const pool = new Pool({ connectionString: getTestDatabaseUrl() });
const db = drizzle(pool, { schema }) as unknown as ContactRevealDatabase;
const events = new DrizzleContactRevealEvents(db);
const metrics = new DrizzleContactRevealMetrics(db);

const CITY = randomUUID();
const ZONE = randomUUID();
const PUBLISHER = randomUUID();
const ANA = randomUUID();
const BRUNO = randomUUID();
const LISTING = randomUUID();
const OTHER_LISTING = randomUUID();

/** Ana reveals the same listing three times, a week apart. */
const REVEALS = [
  new Date("2026-03-01T10:00:00.000Z"),
  new Date("2026-03-08T10:00:00.000Z"),
  new Date("2026-03-15T10:00:00.000Z"),
];

async function insertListing(id: string) {
  await pool.query(
    `INSERT INTO "listing" (id, publisher_id, publisher_type, city_id, zone_id, title,
       description, price_usd, rooms, area_m2, contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner',$3,$4,'Título','x',450,2,78,'whatsapp','04121234567','active',now(),now() + interval '30 days')`,
    [id, PUBLISHER, CITY, ZONE],
  );
}

beforeAll(async () => {
  await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [CITY, `Ciudad ${CITY}`]);
  await pool.query(`INSERT INTO "zone" (id, city_id, name) VALUES ($1,$2,$3)`, [
    ZONE,
    CITY,
    "Zona",
  ]);
  for (const id of [PUBLISHER, ANA, BRUNO]) {
    await pool.query(`INSERT INTO "user" (id, email) VALUES ($1,$2)`, [id, `${id}@ej.com`]);
  }
  await insertListing(LISTING);
  await insertListing(OTHER_LISTING);

  for (const revealedAt of REVEALS) {
    await events.record({
      listingId: LISTING,
      publisherId: PUBLISHER,
      tenantUserId: ANA,
      cityId: CITY,
      revealedAt,
    });
  }

  // A second tenant on the same listing, and Ana on a second listing: without
  // these, a view that returned "one row, always" would pass every assertion
  // below for the wrong reason.
  await events.record({
    listingId: LISTING,
    publisherId: PUBLISHER,
    tenantUserId: BRUNO,
    cityId: CITY,
    revealedAt: new Date("2026-03-02T10:00:00.000Z"),
  });
  await events.record({
    listingId: OTHER_LISTING,
    publisherId: PUBLISHER,
    tenantUserId: ANA,
    cityId: CITY,
    revealedAt: new Date("2026-03-03T10:00:00.000Z"),
  });
});

afterAll(async () => {
  await pool.query(`DELETE FROM "contact_reveal_event" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "listing" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "user" WHERE id = ANY($1)`, [[PUBLISHER, ANA, BRUNO]]);
  await pool.query(`DELETE FROM "zone" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "city" WHERE id = $1`, [CITY]);
  await pool.end();
});

describe("contact_reveal_event", () => {
  // contact-reveal spec, "Repeated reveals by the same tenant still count".
  // The raw log is the source of truth both figures come from; if the insert
  // ever became an upsert, the action count would be silently unrecoverable.
  it("keeps every reveal action, including the repeats", async () => {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::int AS count FROM "contact_reveal_event"
       WHERE tenant_user_id = $1 AND listing_id = $2`,
      [ANA, LISTING],
    );

    expect(Number(rows[0]?.count)).toBe(REVEALS.length);
  });
});

describe("contact_reveal_unique_pair", () => {
  it("collapses N repeat reveals of one pair into one row counting N", async () => {
    const pairs = await metrics.findUniquePairs({ listingId: LISTING });
    const ana = pairs.filter((pair) => pair.tenantUserId === ANA);

    expect(ana).toHaveLength(1);
    expect(ana[0]?.revealCount).toBe(REVEALS.length);
  });

  it("reports the earliest reveal as first_revealed_at", async () => {
    // Cohort semantics (design.md D6): a pair belongs to the period of its
    // FIRST reveal. Taking the latest instead would move a month-1 tenant
    // into month 3 and make the curve look like growth that never happened.
    const [ana] = await metrics.findUniquePairs({ listingId: LISTING, tenantUserId: ANA });

    expect(ana?.firstRevealedAt).toEqual(REVEALS[0]);
    expect(ana?.publisherId).toBe(PUBLISHER);
    expect(ana?.cityId).toBe(CITY);
  });

  it("counts two tenants on one listing as two pairs", async () => {
    const pairs = await metrics.findUniquePairs({ listingId: LISTING });

    expect(pairs.map((pair) => pair.tenantUserId).sort()).toEqual([ANA, BRUNO].sort());
  });

  it("keeps the same tenant's two listings apart", async () => {
    const pairs = await metrics.findUniquePairs({ cityId: CITY });

    expect(pairs).toHaveLength(3);
    expect(pairs.filter((pair) => pair.tenantUserId === ANA)).toHaveLength(2);
  });

  it("reports more raw actions than pairs once a tenant repeats", async () => {
    // contact-reveal spec, "Both figures are derivable from the same event
    // log". The spec's own wording is `>=`, but this fixture deliberately
    // contains repeats, so here the inequality is STRICT — and it has to be
    // asserted that way: with `>=`, a view that emitted one row per raw event
    // with `reveal_count = 1` passes, because 5 actions >= 5 rows. That exact
    // mutation was run against this file and slipped through until the
    // assertion was tightened.
    const pairs = await metrics.findUniquePairs({ cityId: CITY });
    const actions = pairs.reduce((total, pair) => total + pair.revealCount, 0);

    expect(actions).toBe(REVEALS.length + 2);
    expect(actions).toBeGreaterThan(pairs.length);
  });
});
