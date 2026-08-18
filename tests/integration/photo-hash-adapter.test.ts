import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PerceptualHash } from "../../src/modules/listing-trust/domain/perceptual-hash";
import {
  DrizzlePhotoHash,
  type TrustDatabase,
} from "../../src/modules/listing-trust/infrastructure/drizzle-photo-hash";
import * as schema from "../../src/shared/db/schema";

/**
 * Task 4.6 — the duplicate scan against real Postgres.
 *
 * **D4's same-publisher exemption is the assertion that matters**, and it is
 * the one an in-memory fake cannot prove: the fake filters because it was
 * written to, this proves the SQL does. Getting it wrong in either direction
 * is a product failure with a face — a scam re-upload that sails through, or
 * an honest owner told their own photo belongs to somebody else.
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
const db = drizzle(pool, { schema }) as unknown as TrustDatabase;
const photoHash = new DrizzlePhotoHash(db);

const CITY = randomUUID();
const ZONE = randomUUID();
const ANA = randomUUID();
const BRUNO = randomUUID();

/** Ana's two listings, Bruno's one. */
const ANA_ACTIVE = randomUUID();
const ANA_EXPIRED = randomUUID();
const BRUNO_LISTING = randomUUID();

const ANA_PHOTO = randomUUID();
const ANA_OLD_PHOTO = randomUUID();
const BRUNO_PHOTO = randomUUID();
const BRUNO_FAR_PHOTO = randomUUID();

const BASE = 0x00000000000000ffn as PerceptualHash;
/** Two bits away from BASE — a re-encoded copy of the same photograph. */
const NEAR = 0x00000000000000fcn as PerceptualHash;
/** Thirty-two bits away — a different photograph entirely. */
const FAR = 0xffffffff000000ffn as PerceptualHash;

function bits(hash: bigint): string {
  return hash.toString(2).padStart(64, "0");
}

async function insertListing(id: string, publisherId: string, status: string) {
  await pool.query(
    `INSERT INTO "listing" (id, publisher_id, publisher_type, city_id, zone_id, title,
       description, price_usd, rooms, area_m2, status, published_at, expires_at)
     VALUES ($1,$2,'owner',$3,$4,'Título','x',450,2,78,$5,now(),now() + interval '30 days')`,
    [id, publisherId, CITY, ZONE, status],
  );
}

async function insertPhoto(id: string, listingId: string, position: number, hash: bigint) {
  await pool.query(
    `INSERT INTO "listing_photo" (id, listing_id, position, thumbnail_key, detail_key,
       thumbnail_bytes, detail_bytes, created_at)
     VALUES ($1,$2,$3,'t','d',4000,120000,now())`,
    [id, listingId, position],
  );
  await pool.query(
    `INSERT INTO "listing_photo_hash" (photo_id, hash, created_at)
     VALUES ($1,$2::bit(64),now())`,
    [id, bits(hash)],
  );
}

beforeAll(async () => {
  await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [CITY, `Ciudad ${CITY}`]);
  await pool.query(`INSERT INTO "zone" (id, city_id, name) VALUES ($1,$2,$3)`, [
    ZONE,
    CITY,
    "Zona",
  ]);
  for (const [id, email] of [
    [ANA, "ana"],
    [BRUNO, "bruno"],
  ] as const) {
    await pool.query(`INSERT INTO "user" (id, email) VALUES ($1,$2)`, [
      id,
      `${email}-${id}@ej.com`,
    ]);
  }

  await insertListing(ANA_ACTIVE, ANA, "active");
  await insertListing(ANA_EXPIRED, ANA, "expired");
  await insertListing(BRUNO_LISTING, BRUNO, "active");

  await insertPhoto(ANA_PHOTO, ANA_ACTIVE, 0, BASE);
  await insertPhoto(ANA_OLD_PHOTO, ANA_EXPIRED, 0, NEAR);
  await insertPhoto(BRUNO_PHOTO, BRUNO_LISTING, 0, NEAR);
  await insertPhoto(BRUNO_FAR_PHOTO, BRUNO_LISTING, 1, FAR);
});

afterAll(async () => {
  await pool.query(`DELETE FROM "user" WHERE id = ANY($1)`, [[ANA, BRUNO]]);
  await pool.query(`DELETE FROM "city" WHERE id = $1`, [CITY]);
  await pool.end();
});

describe("findMatchesFromOtherPublishers", () => {
  it("finds another publisher's perceptually-matching photo", async () => {
    const matches = await photoHash.findMatchesFromOtherPublishers(BASE, ANA, 8);

    expect(matches).toEqual([
      { photoId: BRUNO_PHOTO, listingId: BRUNO_LISTING, publisherId: BRUNO, distance: 2 },
    ]);
  });

  it("never returns the caller's own photos, active or expired", async () => {
    // The exemption D4 exists for. Ana's expired listing holds the SAME hash
    // Bruno's does: if the exclusion were missing or applied to the wrong
    // column, this test would return two rows instead of one — and an honest
    // owner republishing after expiry would be accused of copying herself.
    const matches = await photoHash.findMatchesFromOtherPublishers(BASE, ANA, 8);

    expect(matches.map((m) => m.publisherId)).not.toContain(ANA);
    expect(matches).toHaveLength(1);
  });

  it("is symmetric: Bruno searching finds Ana, not himself", async () => {
    const matches = await photoHash.findMatchesFromOtherPublishers(NEAR, BRUNO, 8);

    expect(matches.map((m) => m.publisherId)).toEqual([ANA, ANA]);
  });

  it("respects the distance ceiling rather than returning everything", async () => {
    // Distance 0 is an exact match only. Bruno's photo is 2 away, so a
    // threshold that ignored maxDistance would still return it.
    expect(await photoHash.findMatchesFromOtherPublishers(BASE, ANA, 0)).toEqual([]);
    expect(await photoHash.findMatchesFromOtherPublishers(BASE, ANA, 2)).toHaveLength(1);
  });

  it("leaves a genuinely different photograph alone", async () => {
    // FAR is 32 bits away and belongs to Bruno. At the calibrated ceiling it
    // must not surface: a duplicate detector that flags unrelated photos is
    // one publishers learn to ignore.
    const matches = await photoHash.findMatchesFromOtherPublishers(BASE, ANA, 8);

    expect(matches.map((m) => m.photoId)).not.toContain(BRUNO_FAR_PHOTO);
  });

  it("returns the closest match first", async () => {
    // The reviewer looks at the first row. Ordering by distance puts the most
    // likely copy there rather than whichever row Postgres reached first.
    const matches = await photoHash.findMatchesFromOtherPublishers(BASE, ANA, 64);
    const distances = matches.map((m) => m.distance);

    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });
});
