#!/usr/bin/env tsx
// The row half of the budget pair — scripts/budget-bundle.ts is the byte
// half. Its own comment calls itself "the fast half of the budget pair"
// because it reads .next's build output and needs no deployment; this one
// needs a real Postgres with the real taxonomy, because that is the only
// thing the ceiling it checks (tasks.md 27.4) is actually about.
//
// The defect this exists to catch was never a code bug that a type checker
// or a byte count could see: `resolveZoneRoute` always fetched the whole
// taxonomy, cost nothing while the catalogue had ten zones, and cost 580x
// more the day a reseed grew it to 5,813 — with the exact same code on
// both sides of that line (tasks.md 27.1). Only a real database, seeded
// with the real taxonomy, can reproduce that shape.
//
// This script does NOT re-implement the ceiling. src/modules/operability/
// domain/row-budget.ts's assertRowBudget() is already wired into every
// read-path adapter this script calls (DrizzleCatalogue, DrizzleActiveZones,
// DrizzleHomeCollections, DrizzleListingPhotos, DrizzleListingSearch,
// DrizzleFacetedSearch) — the exact same production code, not a copy. If
// any of them ever returns more than 300 rows, the adapter itself throws
// RowBudgetExceededError, this script's promise chain rejects, and the
// process exits non-zero. This script's only job is to point that already-
// wired guard at real data before a PR merges, not to decide what a breach
// looks like.
//
// Usage: TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rentas_test pnpm run budget:rows
// Re-runnable: seed(db) is idempotent (stable ids, onConflictDoUpdate/
// onConflictDoNothing throughout — src/shared/db/seed.ts), so this never
// needs a fresh container to mean something.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { CatalogueDatabase } from "../src/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { DrizzleCatalogue } from "../src/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { homeCollections } from "../src/modules/listing-discovery/domain/home-collections";
import { DrizzleActiveZones } from "../src/modules/listing-discovery/infrastructure/drizzle-active-zones";
import { DrizzleHomeCollections } from "../src/modules/listing-discovery/infrastructure/drizzle-home-collections";
import { DrizzleListingPhotos } from "../src/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { DrizzleFacetedSearch } from "../src/modules/listing-search/infrastructure/drizzle-faceted-search";
import { DrizzleListingSearch } from "../src/modules/listing-search/infrastructure/drizzle-listing-search";
import {
  assertRowBudget,
  RowBudgetExceededError,
} from "../src/modules/operability/domain/row-budget";
import { type SeedDatabase, seed } from "../src/shared/db/seed";

async function main(): Promise<void> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    console.error(
      "budget:rows: TEST_DATABASE_URL is not set. This gate needs a real Postgres with the " +
        "real taxonomy — the defect it catches (tasks.md 27.4) is invisible against ten rows.",
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool) as unknown as CatalogueDatabase;

  try {
    // Real taxonomy (5 areas, ~5,800 zones) + the eleven curated demo
    // listings design.md's content registry defines. Idempotent, so this is
    // safe to run against an already-seeded database too. `seed()`'s own
    // `SeedDatabase` type is pinned to the neon-http driver's result shape
    // (tests/integration/seed-taxonomy.test.ts casts the same way against
    // node-postgres, which is exactly this script's situation).
    console.log("budget:rows: seeding the real taxonomy + demo listings…");
    await seed(db as unknown as SeedDatabase);

    const catalogue = new DrizzleCatalogue(db);
    const activeZonesHome = new DrizzleActiveZones(db);
    const homeCollectionsPort = new DrizzleHomeCollections(db);
    const photos = new DrizzleListingPhotos(db);
    const search = new DrizzleListingSearch(db);
    const facets = new DrizzleFacetedSearch(db);

    // **The regression proof, run against the exact real taxonomy above.**
    // `CataloguePort.listZones()` is deliberately excluded from the wired
    // ceiling — it is broker-bulk-import's legitimate full-taxonomy read
    // (drizzle-catalogue.ts's own comment says why). That is exactly what
    // makes it the right stand-in for "a regression reintroduces the
    // pre-27.1 unbounded read": if a future PR ever calls it from the
    // public read path again, THIS is the shape it would return, and
    // assertRowBudget must reject it. Proving that here — against today's
    // real ~5,800-zone taxonomy, not a fixture — is the honest version of
    // "would this have caught the 2026-09-07 incident?" without reverting
    // any shipped code to manufacture a fake failure.
    const fullTaxonomy = await catalogue.listZones();
    try {
      assertRowBudget(fullTaxonomy, "regression-check: full taxonomy read");
      throw new Error(
        `budget:rows: regression check did not fire — listZones() returned only ` +
          `${fullTaxonomy.length} row(s), at or under the 300-row ceiling. Either the seeded ` +
          "taxonomy shrank far below its real size, or assertRowBudget stopped throwing; " +
          "either way this proof no longer proves anything and must be investigated.",
      );
    } catch (error) {
      if (!(error instanceof RowBudgetExceededError)) throw error;
      console.log(
        `budget:rows: regression check PASSED — a full-taxonomy read (${fullTaxonomy.length} ` +
          `rows) trips the ceiling exactly as it would if a PR reintroduced it into the read path.`,
      );
    }

    console.log("budget:rows: HOME (app/page.tsx)");
    const cities = await catalogue.listCities();
    await activeZonesHome.listActiveZones();
    const specs = homeCollections(cities, null);
    const collections = await homeCollectionsPort.collectionsFor(specs);
    const homeListingIds = [
      ...new Set([...collections.values()].flatMap((page) => page.rows.map((row) => row.id))),
    ];
    await photos.coversFor(homeListingIds);

    const city = cities.find((candidate) => candidate.name === "Caracas");
    if (!city) {
      throw new Error(
        "budget:rows: no 'Caracas' city found after seeding — src/shared/db/seed.ts's demo " +
          "listings assume it exists. Nothing was measured for the city/zone pages.",
      );
    }

    console.log(`budget:rows: CIUDAD — ${city.name} (app/alquiler/[ciudad]/page.tsx)`);
    const activeZones = await catalogue.listActiveZones(city.id);
    const cityCriteria = { cityId: city.id, page: 1 };
    const cityResults = await search.search(cityCriteria);
    await photos.coversFor(cityResults.map((row) => row.id));
    await facets.countFacets(
      cityCriteria,
      activeZones.map((zone) => zone.id),
    );

    const zone = activeZones[0];
    if (!zone) {
      console.log(
        "budget:rows: no active zone under Caracas after seeding — the zone page has nothing " +
          "to measure this run. Not a failure: it means the demo seed produced zero active " +
          "listings there, which the city-page check above already covers with the same guard.",
      );
    } else {
      console.log(
        `budget:rows: ZONA — ${city.name}/${zone.name} (app/alquiler/[ciudad]/[zona]/page.tsx)`,
      );
      await catalogue.findZonesByTokens(city.id, [zone.id]);
      const zoneCriteria = { cityId: city.id, zoneIds: [zone.id], page: 1 };
      const zoneResults = await search.search(zoneCriteria);
      await photos.coversFor(zoneResults.map((row) => row.id));
      await facets.countFacets(zoneCriteria, [zone.id]);
    }

    console.log(
      "budget:rows: PASS — every read-path query stayed at or under the 300-row ceiling.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
