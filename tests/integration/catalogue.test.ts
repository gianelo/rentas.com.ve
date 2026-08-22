import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  resolveSelectedCity,
  zonesForCity,
} from "../../src/modules/listing-catalogue/domain/catalogue";
import {
  type CatalogueDatabase,
  DrizzleCatalogue,
} from "../../src/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import * as schema from "../../src/shared/db/schema";

/**
 * `DrizzleCatalogue` against real Postgres.
 *
 * **What is worth proving here, and what is not.** The narrowing rules
 * (`resolveSelectedCity`, `zonesForCity`) are pure and already covered by
 * unit tests; re-asserting them through a database would prove nothing new
 * and would be slower about it. What only Postgres can answer is the seam:
 * whether the rows this adapter emits are the shape those rules expect, and
 * whether the ORDER BY the default city depends on is real.
 *
 * That second one is the reason this file exists at all. `resolveSelectedCity`
 * is specified as "the catalogue's first city" — so the site's root, for every
 * visitor who has not chosen, is decided by an `ORDER BY name` inside this
 * adapter. A unit test cannot see that ordering. If someone drops the sort as
 * a tidy-up, nothing else in the suite notices and the home page silently
 * changes city.
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
const db = drizzle(pool, { schema }) as unknown as CatalogueDatabase;
const catalogue = new DrizzleCatalogue(db);

// Names carry a suffix because `city.name` is UNIQUE and this suite shares one
// database with every other integration file. The alphabetical ORDER BY has to
// remain observable, so the prefixes are chosen to sort in a known order and
// the assertions compare positions among THESE rows rather than absolute ones.
const ALPHA_CITY = randomUUID();
const BETA_CITY = randomUUID();
const ALPHA_NAME = `AAA-Alfa ${ALPHA_CITY}`;
const BETA_NAME = `AAB-Beta ${BETA_CITY}`;

const ALPHA_ZONE_LATE = randomUUID();
const ALPHA_ZONE_EARLY = randomUUID();
const BETA_ZONE = randomUUID();

beforeAll(async () => {
  // **Inserted in REVERSE alphabetical order, and that is the whole test.**
  // The first version inserted Alfa then Beta, so "insertion order" and
  // "alphabetical order" were the same sequence — and the assertion below
  // passed with the `ORDER BY` deleted from the adapter. A test that cannot
  // fail for the reason it names is worse than no test, because it reports
  // the guarantee as held. Caught by mutation, not by reading.
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2),($3,$4)', [
    BETA_CITY,
    BETA_NAME,
    ALPHA_CITY,
    ALPHA_NAME,
  ]);
  // Inserted out of alphabetical order on purpose: an adapter that returned
  // insertion order would pass a test whose fixtures were already sorted.
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE'),($4,$5,$6),($7,$8,$9)`,
    [
      ALPHA_ZONE_LATE,
      ALPHA_CITY,
      `ZZZ-Ultima ${ALPHA_ZONE_LATE}`,
      ALPHA_ZONE_EARLY,
      ALPHA_CITY,
      `AAA-Primera ${ALPHA_ZONE_EARLY}`,
      BETA_ZONE,
      BETA_CITY,
      `MMM-Media ${BETA_ZONE}`,
    ],
  );
});

afterAll(async () => {
  // Zones go with the city: `zone_city_id_city_id_fk` is ON DELETE cascade,
  // which is the same constraint this file relies on for the orphan case.
  await pool.query('DELETE FROM "city" WHERE id = ANY($1)', [[ALPHA_CITY, BETA_CITY]]);
  await pool.end();
});

describe("DrizzleCatalogue.listCities", () => {
  it("returns cities sorted by name, which is what decides the default city", async () => {
    const cities = await catalogue.listCities();
    const ours = cities.filter((city) => city.id === ALPHA_CITY || city.id === BETA_CITY);

    expect(ours.map((city) => city.id)).toEqual([ALPHA_CITY, BETA_CITY]);
  });

  it("emits rows the domain rule can consume unchanged", async () => {
    // The seam, asserted end to end: real rows in, the shipped rule applied,
    // the id the search page would use out.
    const cities = await catalogue.listCities();

    expect(resolveSelectedCity(cities, BETA_CITY)).toBe(BETA_CITY);
    expect(resolveSelectedCity(cities, "no-es-una-ciudad")).toBe(cities[0]?.id);
  });
});

describe("DrizzleCatalogue.listZones", () => {
  it("returns zones sorted by name rather than insertion order", async () => {
    const zones = await catalogue.listZones();
    const ours = zones.filter((zone) => zone.cityId === ALPHA_CITY);

    expect(ours.map((zone) => zone.id)).toEqual([ALPHA_ZONE_EARLY, ALPHA_ZONE_LATE]);
  });

  it("carries cityId, so the cascade the visitor sees actually narrows", async () => {
    // The founder's cascade (2026-08-21), proven against real rows: picking
    // one city must not leave the other city's zones in the selector.
    const zones = await catalogue.listZones();

    expect(zonesForCity(zones, ALPHA_CITY).map((zone) => zone.id)).toEqual([
      ALPHA_ZONE_EARLY,
      ALPHA_ZONE_LATE,
    ]);
    expect(zonesForCity(zones, BETA_CITY).map((zone) => zone.id)).toEqual([BETA_ZONE]);
  });

  /**
   * **The join this adapter deliberately does not do.** `listZones` shipped
   * with an `innerJoin` against `city`, guarding a zone whose city had been
   * removed. `zone_city_id_city_id_fk` is `ON DELETE cascade` (drizzle/0001),
   * so that row cannot exist — and this asserts it against the running
   * database rather than against a reading of the migration file. If someone
   * ever weakens the constraint, this fails and the join has to come back.
   */
  it("cannot hold a zone whose city is gone — the foreign key is the guarantee", async () => {
    const doomedCity = randomUUID();
    const doomedZone = randomUUID();

    await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2)', [
      doomedCity,
      `Efimera ${doomedCity}`,
    ]);
    await pool.query(
      `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
      [doomedZone, doomedCity, `Zona ${doomedZone}`],
    );
    await pool.query('DELETE FROM "city" WHERE id = $1', [doomedCity]);

    const zones = await catalogue.listZones();

    expect(zones.some((zone) => zone.id === doomedZone)).toBe(false);
  });
});
