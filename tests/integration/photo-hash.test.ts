import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  hammingDistance,
  KNOWN_HAMMING_DISTANCE_VECTORS,
} from "../../src/modules/listing-trust/domain/hamming-distance";

/**
 * `listing_photo_hash` (tasks.md 4.1, design.md D4).
 *
 * **The drift cross-check is the reason this file exists.** D4 computes
 * Hamming distance twice — once in TypeScript, so the domain can be tested
 * without a database, and once as a Postgres expression, so the duplicate
 * scan runs where the rows are. Two implementations of the same arithmetic
 * that drift apart are worse than one untested implementation: an untested
 * one has a visible gap, while a drifted pair returns a confident wrong
 * answer. Here, that wrong answer is either "your own photo is a duplicate
 * of somebody else's" or a scam re-upload that sails through.
 *
 * So the domain's own vectors are replayed through real Postgres and asserted
 * to agree, digit for digit.
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

/** A `PerceptualHash` as the 64-character bit string the column stores. */
function toBitString(hash: bigint): string {
  return hash.toString(2).padStart(64, "0");
}

const CITY = randomUUID();
const ZONE = randomUUID();
const PUBLISHER = randomUUID();
const LISTING = randomUUID();
const PHOTO = randomUUID();

beforeAll(async () => {
  await client.connect();
  await client.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [CITY, `Ciudad ${CITY}`]);
  await client.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [ZONE, CITY, "Zona"],
  );
  await client.query(`INSERT INTO "user" (id, email) VALUES ($1,$2)`, [
    PUBLISHER,
    `${PUBLISHER}@example.com`,
  ]);
  await client.query(
    `INSERT INTO "listing" (id, publisher_id, publisher_type, property_type, city_id, zone_id, title,
       description, price_usd, rooms, area_m2, bathrooms, contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,'Título','x',450,2,78,2,'whatsapp','04121234567','active',now(),now() + interval '30 days')`,
    [LISTING, PUBLISHER, CITY, ZONE],
  );
  await client.query(
    `INSERT INTO "listing_photo" (id, listing_id, position, thumbnail_key, detail_key,
       thumbnail_bytes, detail_bytes, created_at)
     VALUES ($1,$2,0,'t','d',4000,120000,now())`,
    [PHOTO, LISTING],
  );
});

afterAll(async () => {
  await client.query(`DELETE FROM "user" WHERE id = $1`, [PUBLISHER]);
  await client.query(`DELETE FROM "city" WHERE id = $1`, [CITY]);
  await client.end();
});

describe("bit_count Hamming distance agrees with the domain", () => {
  it.each(KNOWN_HAMMING_DISTANCE_VECTORS)(
    "distance $distance matches in Postgres and in TypeScript",
    async ({ a, b, distance }) => {
      const result = await client.query<{ d: number }>(
        `SELECT bit_count($1::bit(64) # $2::bit(64))::int AS d`,
        [toBitString(a), toBitString(b)],
      );

      // Three-way: the vector's declared value, what TypeScript computes, and
      // what Postgres computes. Any two agreeing while the third differs is
      // exactly the drift this asserts against.
      expect(result.rows[0]?.d).toBe(distance);
      expect(hammingDistance(a, b)).toBe(distance);
    },
  );
});

describe("listing_photo_hash", () => {
  it("stores a 64-bit hash and reads it back unchanged", async () => {
    const hash = toBitString(0x5555555555555555n);
    await client.query(
      `INSERT INTO "listing_photo_hash" (photo_id, hash, created_at) VALUES ($1,$2::bit(64),now())`,
      [PHOTO, hash],
    );

    const stored = await client.query<{ hash: string }>(
      `SELECT hash::text FROM "listing_photo_hash" WHERE photo_id = $1`,
      [PHOTO],
    );

    expect(stored.rows[0]?.hash).toBe(hash);
  });

  it("refuses a hash that is not exactly 64 bits", async () => {
    // The column type is the guard. A 63-bit value silently zero-padded or a
    // 65-bit one truncated would shift every comparison against it, and the
    // resulting distances would look plausible.
    await expect(
      client.query(
        `INSERT INTO "listing_photo_hash" (photo_id, hash, created_at)
         VALUES ($1,$2::bit(63),now())`,
        [randomUUID(), "1".repeat(63)],
      ),
    ).rejects.toThrow();
  });

  it("allows only one hash per photo", async () => {
    // The primary key says so. A photo with two hashes makes "is this a
    // duplicate" depend on which row a scan happened to reach first.
    await expect(
      client.query(
        `INSERT INTO "listing_photo_hash" (photo_id, hash, created_at)
         VALUES ($1,$2::bit(64),now())`,
        [PHOTO, toBitString(0n)],
      ),
    ).rejects.toThrow();
  });

  it("disappears with its photo", async () => {
    // A hash outliving its photo would keep matching against an image nobody
    // can see, and the publisher accused of duplicating it would have no way
    // to find out what they supposedly copied.
    const photoId = randomUUID();
    await client.query(
      `INSERT INTO "listing_photo" (id, listing_id, position, thumbnail_key, detail_key,
         thumbnail_bytes, detail_bytes, created_at)
       VALUES ($1,$2,1,'t','d',4000,120000,now())`,
      [photoId, LISTING],
    );
    await client.query(
      `INSERT INTO "listing_photo_hash" (photo_id, hash, created_at) VALUES ($1,$2::bit(64),now())`,
      [photoId, toBitString(1n)],
    );

    await client.query(`DELETE FROM "listing_photo" WHERE id = $1`, [photoId]);

    const remaining = await client.query(`SELECT 1 FROM "listing_photo_hash" WHERE photo_id = $1`, [
      photoId,
    ]);
    expect(remaining.rowCount).toBe(0);
  });
});
