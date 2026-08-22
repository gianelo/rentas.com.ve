import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NewListing } from "../../src/modules/listing-publication/application/ports/listing-repository.port";
import {
  DrizzleListingRepository,
  DrizzleZoneCatalogue,
  type PublicationDatabase,
} from "../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import * as schema from "../../src/shared/db/schema";

/**
 * Task 3.13 — the adapters that make `publishListing` reach a real database.
 *
 * **The atomicity claim is the reason this file exists.** `save()` takes the
 * listing and its photos in one call so it can use one transaction, and that
 * promise is unprovable with a fake: an in-memory repository rolls back
 * because it was written to, not because a database made it. Only Postgres
 * can refuse the second statement and take the first one with it.
 *
 * The adapter takes its database handle as a constructor argument, so the
 * code exercised here is byte-for-byte the code the deployment runs — only
 * the driver differs (`node-postgres` here, `neon-serverless` in production,
 * both `PgDatabase`). That is what `neon-http`'s `batch()` could not offer:
 * it exists on no other driver, so a test would have had to run a different
 * path than production.
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
const db = drizzle(pool, { schema }) as unknown as PublicationDatabase;

const repository = new DrizzleListingRepository(db);
const catalogue = new DrizzleZoneCatalogue(db);

const CAPITAL = randomUUID();
const MARACAIBO = randomUUID();
const CHACAO = randomUUID();
const LA_LAGO = randomUUID();
const PUBLISHER = randomUUID();

function draft(overrides: Partial<NewListing> = {}): NewListing {
  const publishedAt = new Date("2026-08-17T15:00:00.000Z");
  return {
    publisherId: PUBLISHER,
    publisherType: "owner",
    propertyType: "apartamento",
    cityId: CAPITAL,
    zoneId: CHACAO,
    title: "Apartamento 2 habitaciones con puesto de estacionamiento",
    description: "x".repeat(140),
    priceUsd: 520,
    hasPowerPlant: false,
    hasRegularWater: false,
    isFurnished: false,
    hasSecurity: false,
    hasAppliances: false,
    rooms: 2,
    areaM2: 78,
    bathrooms: 2,
    parkingSpots: 1,
    contactMethod: "whatsapp",
    contactValue: "04121234567",
    status: "active",
    publishedAt,
    expiresAt: new Date(publishedAt.getTime() + 30 * 86_400_000),
    photos: [photo(0)],
    ...overrides,
  };
}

function photo(position: number) {
  return {
    position,
    derivatives: [
      {
        name: "thumb" as const,
        key: `photos/${PUBLISHER}/${position}/thumb.webp`,
        byteLength: 4000,
      },
      {
        name: "card" as const,
        key: `photos/${PUBLISHER}/${position}/card.webp`,
        byteLength: 12000,
      },
      {
        name: "strip" as const,
        key: `photos/${PUBLISHER}/${position}/strip.webp`,
        byteLength: 30000,
      },
      {
        name: "detail" as const,
        key: `photos/${PUBLISHER}/${position}/detail.webp`,
        byteLength: 50000,
      },
      {
        name: "full" as const,
        key: `photos/${PUBLISHER}/${position}/full.webp`,
        byteLength: 110000,
      },
    ],
  };
}

beforeAll(async () => {
  await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2),($3,$4)`, [
    CAPITAL,
    `Distrito Capital ${CAPITAL}`,
    MARACAIBO,
    `Maracaibo ${MARACAIBO}`,
  ]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE'),($4,$5,$6,'parroquia','INE')`,
    [CHACAO, CAPITAL, "Chacao", LA_LAGO, MARACAIBO, "La Lago"],
  );
  await pool.query(`INSERT INTO "user" (id, email) VALUES ($1,$2)`, [
    PUBLISHER,
    `${PUBLISHER}@example.com`,
  ]);
});

afterAll(async () => {
  // `city` cascades to `zone`, and `user` cascades to `listing`, which
  // cascades to `listing_photo`. Deleting the two roots is the whole cleanup.
  await pool.query(`DELETE FROM "user" WHERE id = $1`, [PUBLISHER]);
  await pool.query(`DELETE FROM "city" WHERE id = ANY($1)`, [[CAPITAL, MARACAIBO]]);
  await pool.end();
});

describe("DrizzleListingRepository", () => {
  it("writes the listing and every photo in submission order", async () => {
    const { id } = await repository.save(draft({ photos: [photo(0), photo(1), photo(2)] }));

    const listing = await pool.query(`SELECT * FROM "listing" WHERE id = $1`, [id]);
    expect(listing.rows[0]).toMatchObject({
      publisher_id: PUBLISHER,
      publisher_type: "owner",
      city_id: CAPITAL,
      zone_id: CHACAO,
      price_usd: 520,
      rooms: 2,
      area_m2: 78,
      status: "active",
    });

    const photos = await pool.query(
      `SELECT p.position, d.bytes AS thumb_bytes
         FROM "listing_photo" p
         JOIN "listing_photo_derivative" d ON d.photo_id = p.id AND d.name = 'thumb'
        WHERE p.listing_id = $1 ORDER BY p.position`,
      [id],
    );
    expect(photos.rows.map((row) => row.position)).toEqual([0, 1, 2]);
    expect(photos.rows[0]?.thumb_bytes).toBe(4_000);
  });

  it("leaves no listing behind when a photo row is refused", async () => {
    const before = await pool.query(`SELECT count(*)::int AS n FROM "listing"`);

    // Two photos claiming position 0 violates UNIQUE(listing_id, position),
    // which Postgres refuses on the SECOND statement — after the listing row
    // was already inserted. Without one transaction the catalogue keeps a
    // listing with one photo instead of two, or none at all, and the publish
    // rule that says a listing has photos would be quietly false.
    await expect(repository.save(draft({ photos: [photo(0), photo(0)] }))).rejects.toThrow();

    const after = await pool.query(`SELECT count(*)::int AS n FROM "listing"`);
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
  });

  it("refuses a zone that belongs to another city", async () => {
    // D5 at the database boundary, reached through the adapter this time:
    // the composite foreign key, not an application check.
    await expect(repository.save(draft({ zoneId: LA_LAGO }))).rejects.toThrow();
  });
});

describe("DrizzleZoneCatalogue", () => {
  it("returns only the zones of the city asked for", async () => {
    const found = await catalogue.listZonesForCity(CAPITAL);

    expect(found).toEqual([{ id: CHACAO, cityId: CAPITAL }]);
  });

  it("returns nothing for a city this product does not launch in", async () => {
    // What makes `cityId.unknown` reachable: an empty list is exactly how the
    // validator learns a city has no curated zone.
    expect(await catalogue.listZonesForCity(randomUUID())).toEqual([]);
  });
});
