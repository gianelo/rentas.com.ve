import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DrizzleListingSearch,
  type SearchDatabase,
} from "../../src/modules/listing-search/infrastructure/drizzle-listing-search";
import * as schema from "../../src/shared/db/schema";

/**
 * Tasks 5.3/5.5 — city isolation and the active-only rule, against real
 * Postgres. An in-memory fake would filter because it was written to; this
 * proves the SQL does. Isolation is the guarantee the whole product rests
 * on (design.md D5), and its failure mode is silent: a Caracas flat in a
 * Maracaibo search looks like a result, not like a bug.
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
const db = drizzle(pool, { schema }) as unknown as SearchDatabase;
const search = new DrizzleListingSearch(db);

const MARACAIBO = randomUUID();
const DISTRITO = randomUUID();
/** Both cities have a "Centro" — the colliding-name case task 5.3 names. */
const MCBO_CENTRO = randomUUID();
const MCBO_NORTE = randomUUID();
const DC_CENTRO = randomUUID();
const ANA = randomUUID();

const MCBO_ACTIVE = randomUUID();
const MCBO_BIG = randomUUID();
const MCBO_EXPIRED = randomUUID();
const MCBO_HIDDEN = randomUUID();
const DC_ACTIVE = randomUUID();

async function insertListing(
  id: string,
  zoneId: string,
  cityId: string,
  price: number,
  rooms: number,
  areaM2: number,
  status: string,
  publisherType = "owner",
) {
  await pool.query(
    `INSERT INTO "listing" (id, publisher_id, publisher_type, city_id, zone_id, title,
       description, price_usd, rooms, area_m2, status, published_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,'Apartamento','x',$6,$7,$8,$9,now(),now() + interval '30 days')`,
    [id, ANA, publisherType, cityId, zoneId, price, rooms, areaM2, status],
  );
}

beforeAll(async () => {
  for (const [city, name] of [
    [MARACAIBO, "Maracaibo"],
    [DISTRITO, "Distrito Capital"],
  ] as const) {
    await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [city, `${name} ${city}`]);
  }
  for (const [zone, city, name] of [
    [MCBO_CENTRO, MARACAIBO, "Centro"],
    [MCBO_NORTE, MARACAIBO, "Norte"],
    [DC_CENTRO, DISTRITO, "Centro"],
  ] as const) {
    await pool.query(`INSERT INTO "zone" (id, city_id, name) VALUES ($1,$2,$3)`, [
      zone,
      city,
      name,
    ]);
  }
  await pool.query(`INSERT INTO "user" (id, email) VALUES ($1,$2)`, [ANA, `ana-${ANA}@ej.com`]);

  await insertListing(MCBO_ACTIVE, MCBO_CENTRO, MARACAIBO, 320, 2, 74, "active");
  await insertListing(MCBO_BIG, MCBO_NORTE, MARACAIBO, 900, 3, 120, "active", "broker");
  await insertListing(MCBO_EXPIRED, MCBO_CENTRO, MARACAIBO, 300, 2, 70, "expired");
  await insertListing(MCBO_HIDDEN, MCBO_CENTRO, MARACAIBO, 310, 2, 71, "hidden");
  await insertListing(DC_ACTIVE, DC_CENTRO, DISTRITO, 350, 2, 70, "active");
});

afterAll(async () => {
  await pool.query(`DELETE FROM "user" WHERE id = $1`, [ANA]);
  await pool.query(`DELETE FROM "city" WHERE id = ANY($1)`, [[MARACAIBO, DISTRITO]]);
  await pool.end();
});

describe("city isolation (D5, task 5.3)", () => {
  it("returns no Distrito Capital listing for a Maracaibo search with no other filter", async () => {
    const results = await search.search({ cityId: MARACAIBO });

    expect(results.map((r) => r.id).sort()).toEqual([MCBO_ACTIVE, MCBO_BIG].sort());
    expect(results.every((r) => r.cityId === MARACAIBO)).toBe(true);
  });

  it("holds across a price range wide enough to include the Caracas listing", async () => {
    // DC_ACTIVE costs 350, squarely inside this range. A query missing its
    // city predicate would return it here and nowhere else.
    const results = await search.search({ cityId: MARACAIBO, minPriceUsd: 0, maxPriceUsd: 100000 });

    expect(results.map((r) => r.id)).not.toContain(DC_ACTIVE);
  });

  it("holds when the zone name collides across cities", async () => {
    // Two zones named "Centro". Filtering by the Maracaibo one must not
    // reach the Caracas one — the ids differ, and the id is what is asked
    // for, but a query that joined or matched on name would not know that.
    const results = await search.search({ cityId: MARACAIBO, zoneId: MCBO_CENTRO });

    expect(results.map((r) => r.id)).toEqual([MCBO_ACTIVE]);
  });
});

describe("active only (tasks 5.5/5.6)", () => {
  it("excludes expired and auto-hidden listings that would otherwise match", async () => {
    // Same city, same zone, same price band as MCBO_ACTIVE: status is the
    // only reason these two are absent.
    const results = await search.search({ cityId: MARACAIBO, zoneId: MCBO_CENTRO });
    const ids = results.map((r) => r.id);

    expect(ids).not.toContain(MCBO_EXPIRED);
    expect(ids).not.toContain(MCBO_HIDDEN);
  });
});

describe("price and characteristics (task 5.4)", () => {
  it("narrows by price range", async () => {
    expect((await search.search({ cityId: MARACAIBO, maxPriceUsd: 500 })).map((r) => r.id)).toEqual(
      [MCBO_ACTIVE],
    );
    expect((await search.search({ cityId: MARACAIBO, minPriceUsd: 500 })).map((r) => r.id)).toEqual(
      [MCBO_BIG],
    );
  });

  it("narrows by rooms and area, and carries publisher_type per result", async () => {
    const results = await search.search({ cityId: MARACAIBO, minRooms: 3, minAreaM2: 100 });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: MCBO_BIG, publisherType: "broker", areaM2: 120 });
  });
});
