import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../src/modules/identity/application/ports/session.port";
import { attachPhotoToDraft } from "../../src/modules/listing-publication/application/attach-photo-to-draft";
import type { PhotoDerivationPort } from "../../src/modules/listing-publication/application/ports/photo-derivation.port";
import type { PhotoHashComputationPort } from "../../src/modules/listing-publication/application/ports/photo-hash-computation.port";
import type {
  PhotoStoragePort,
  StoredObject,
  UploadTarget,
} from "../../src/modules/listing-publication/application/ports/photo-storage.port";
import { RejectedUploadError } from "../../src/modules/listing-publication/application/process-uploaded-photo";
import { publishListing } from "../../src/modules/listing-publication/application/publish-listing";
import {
  DrizzleListingActivation,
  DrizzleListingRepository,
  DrizzleZoneCatalogue,
  type PublicationDatabase,
} from "../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { toPerceptualHash } from "../../src/modules/listing-trust/domain/perceptual-hash";
import {
  DrizzlePhotoHash,
  type TrustDatabase,
} from "../../src/modules/listing-trust/infrastructure/drizzle-photo-hash";
import * as schema from "../../src/shared/db/schema";

/**
 * Task 4.7, against real Postgres — the wiring itself, not just the two
 * pieces it connects. `PhotoHashPort.findMatchesFromOtherPublishers` (4.5)
 * and `DrizzlePhotoHash` (4.6) each had their own passing suite in
 * isolation; nothing called either from `publishListing` or
 * `attachPhotoToDraft`, and nothing ever wrote a `listing_photo_hash` row
 * outside that table's own adapter test — see both use cases' docstrings
 * for the "known gap" note this file closes.
 *
 * **A fake would not prove this.** The match query is
 * `bit_count(h.hash # $1::bit(64)) <= $2` — Postgres's own population count
 * over an XOR — and this project has already learned twice in two days
 * (slice C's `isUniqueViolation`, slice D's `WHERE` clauses) that a
 * fake-based suite can pass while the real SQL disagrees. `computeHash` is
 * the one fake kept here, and only because it needs to return an EXACT,
 * caller-chosen 64-bit value per test — the real `sharp`-backed dHash is
 * already proven against real image bytes in sharp-dhash.test.ts, and
 * asserting that again here would test `sharp`, not the wiring.
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
const db = drizzle(pool, { schema });

const repository = new DrizzleListingRepository(db as unknown as PublicationDatabase);
const activation = new DrizzleListingActivation(db as unknown as PublicationDatabase);
const zones = new DrizzleZoneCatalogue(db as unknown as PublicationDatabase);
const photoHashes = new DrizzlePhotoHash(db as unknown as TrustDatabase);

const CITY = randomUUID();
const ZONE = randomUUID();
const ANA = randomUUID();
const BRUNO = randomUUID();
const CARLA = randomUUID();
const DIEGO = randomUUID();
const ELENA = randomUUID();
const USER_IDS = [ANA, BRUNO, CARLA, DIEGO, ELENA];

/**
 * Four 64-bit values, each far enough from the others (Hamming distance
 * well above the calibrated `<= 8` ceiling) that no two collide by
 * accident. `NEAR` is the one exception, deliberately 2 bits from `BASE` —
 * "a re-encoded copy of the same photograph", the exact scam pattern D4
 * exists to catch.
 */
const BASE = 0x00000000000000ffn; // Ana's active listing's photo.
const NEAR = 0x00000000000000fcn; // 2 bits from BASE — Bruno's "stolen" copy.
const EXPIRED_HASH = 0x0000000000ff0000n; // Ana's EXPIRED listing's photo. 16 bits from BASE.
const FAR_HASH = 0x00ff000000000000n; // Matches nothing Carla could collide with.
const FAR2_HASH = 0x000000ff00000000n; // Matches nothing Elena could collide with.

function bits(hash: bigint): string {
  return hash.toString(2).padStart(64, "0");
}

async function insertListing(id: string, publisherId: string, status: "active" | "expired") {
  await pool.query(
    `INSERT INTO "listing" (id, publisher_id, publisher_type, property_type, city_id, zone_id, title,
       description, price_usd, rooms, area_m2, bathrooms, contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,'Título','x',450,2,78,2,'whatsapp','04121234567',$5,now(),now() + interval '30 days')`,
    [id, publisherId, CITY, ZONE, status],
  );
}

/** Seeds a photo AND its hash directly — "already in the system" (D4's own wording). */
async function insertPhotoWithHash(id: string, listingId: string, hash: bigint) {
  await pool.query(
    `INSERT INTO "listing_photo" (id, listing_id, position, created_at) VALUES ($1,$2,0,now())`,
    [id, listingId],
  );
  await pool.query(
    `INSERT INTO "listing_photo_hash" (photo_id, hash, created_at) VALUES ($1,$2::bit(64),now())`,
    [id, bits(hash)],
  );
}

beforeAll(async () => {
  await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [ZONE, CITY, "Zona"],
  );
  for (const id of USER_IDS) {
    await pool.query(`INSERT INTO "user" (id, email) VALUES ($1,$2)`, [id, `${id}@example.com`]);
  }

  const anaActive = randomUUID();
  const anaExpired = randomUUID();
  await insertListing(anaActive, ANA, "active");
  await insertListing(anaExpired, ANA, "expired");
  await insertPhotoWithHash(randomUUID(), anaActive, BASE);
  await insertPhotoWithHash(randomUUID(), anaExpired, EXPIRED_HASH);
});

afterAll(async () => {
  await pool.query(`DELETE FROM "user" WHERE id = ANY($1)`, [USER_IDS]);
  await pool.query(`DELETE FROM "city" WHERE id = $1`, [CITY]);
  await pool.end();
});

function sessionFor(userId: string): SessionPort {
  const session: AuthenticatedSession = { userId, email: null, name: null };
  return { getSession: async () => session };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const TOKEN = "9c1d4e6f8a2b0c3d5e7f9a1b3c5d7e9f";

function incomingKeyFor(publisherId: string): string {
  return `incoming/${publisherId}/${TOKEN}`;
}

function fakeStorage(): PhotoStoragePort {
  return {
    async createUploadTarget(): Promise<UploadTarget> {
      throw new Error("not used by this test");
    },
    async read(): Promise<Uint8Array> {
      return PNG;
    },
    async put(key: string, bytes: Uint8Array): Promise<StoredObject> {
      return { key, byteLength: bytes.byteLength };
    },
    async remove(): Promise<void> {},
  };
}

const fakeDerive: PhotoDerivationPort = async () => ({
  thumb: { bytes: new Uint8Array([1]), byteLength: 1 },
  card: { bytes: new Uint8Array([1]), byteLength: 1 },
  strip: { bytes: new Uint8Array([1]), byteLength: 1 },
  detail: { bytes: new Uint8Array([1]), byteLength: 1 },
  full: { bytes: new Uint8Array([1]), byteLength: 1 },
});

/** The one deliberate fake — see the file docstring for why. */
function computeHashReturning(hash: bigint): PhotoHashComputationPort {
  const perceptualHash = toPerceptualHash(hash);
  return async () => perceptualHash;
}

function publishRequest(publisherId: string, overrides: Record<string, unknown> = {}) {
  return {
    publisherType: "owner" as const,
    propertyType: "apartamento" as const,
    title: "Apartamento en alquiler con dos habitaciones",
    description: "x".repeat(140),
    priceUsd: 480,
    cityId: CITY,
    zoneId: ZONE,
    rooms: 2,
    areaM2: 78,
    bathrooms: 2,
    parkingSpots: 1,
    contactMethod: "whatsapp" as const,
    contactValue: "04121234567",
    photos: [{ incomingKey: incomingKeyFor(publisherId), declaredContentType: "image/png" }],
    ...overrides,
  };
}

async function listingCountFor(publisherId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM "listing" WHERE publisher_id = $1`,
    [publisherId],
  );
  return rows[0].n as number;
}

async function recordedHashFor(photoId: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT hash FROM "listing_photo_hash" WHERE photo_id = $1`, [
    photoId,
  ]);
  return (rows[0]?.hash as string | undefined) ?? null;
}

describe("publishListing — D4 cross-account perceptual-hash duplicate rejection, against real Postgres", () => {
  it("rejects Bruno's submission: his photo perceptually matches Ana's existing, active photo", async () => {
    const before = await listingCountFor(BRUNO);

    const failure = await publishListing(publishRequest(BRUNO), {
      sessionPort: sessionFor(BRUNO),
      zones,
      listings: repository,
      storage: fakeStorage(),
      derive: fakeDerive,
      computeHash: computeHashReturning(NEAR),
      photoHashes,
      now: () => new Date("2026-08-24T10:00:00.000Z"),
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RejectedUploadError);
    expect((failure as RejectedUploadError).violations).toEqual([
      "photo.duplicateAcrossPublishers",
    ]);
    // The spec's own words: "rejects the listing submission" — no row for
    // Bruno anywhere, not a partial one and not a hidden one.
    expect(await listingCountFor(BRUNO)).toBe(before);
  });

  it("allows Ana to reuse her OWN active listing's photo — the same-publisher exemption", async () => {
    const { listingId } = await publishListing(publishRequest(ANA), {
      sessionPort: sessionFor(ANA),
      zones,
      listings: repository,
      storage: fakeStorage(),
      derive: fakeDerive,
      computeHash: computeHashReturning(BASE),
      photoHashes,
      now: () => new Date("2026-08-24T10:05:00.000Z"),
    });

    const { rows } = await pool.query(`SELECT status FROM "listing" WHERE id = $1`, [listingId]);
    expect(rows[0]?.status).toBe("active");
  });

  it("allows Ana to reuse a photo from her OWN expired listing — regardless of that listing's status", async () => {
    // listing-trust spec, "Owner republishes their own expired listing with
    // the same photos" — the exact scenario, proven against the real
    // exclusion query rather than an in-memory fake that was written to
    // filter by publisher.
    const { listingId } = await publishListing(publishRequest(ANA), {
      sessionPort: sessionFor(ANA),
      zones,
      listings: repository,
      storage: fakeStorage(),
      derive: fakeDerive,
      computeHash: computeHashReturning(EXPIRED_HASH),
      photoHashes,
      now: () => new Date("2026-08-24T10:10:00.000Z"),
    });

    const { rows } = await pool.query(`SELECT status FROM "listing" WHERE id = $1`, [listingId]);
    expect(rows[0]?.status).toBe("active");
  });

  it("allows a photo matching nothing, and records its hash — the table stops being permanently empty", async () => {
    const { listingId } = await publishListing(publishRequest(CARLA), {
      sessionPort: sessionFor(CARLA),
      zones,
      listings: repository,
      storage: fakeStorage(),
      derive: fakeDerive,
      computeHash: computeHashReturning(FAR_HASH),
      photoHashes,
      now: () => new Date("2026-08-24T10:15:00.000Z"),
    });

    const { rows } = await pool.query(
      `SELECT h.photo_id, h.hash FROM "listing_photo_hash" h
         JOIN "listing_photo" p ON p.id = h.photo_id
        WHERE p.listing_id = $1`,
      [listingId],
    );
    // The last one matters as much as the rest: if recording silently
    // failed, this row simply would not exist, and every rejection test
    // above would still pass while the table stayed empty forever.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hash).toBe(bits(FAR_HASH));
  });
});

describe("attachPhotoToDraft — D4 cross-account perceptual-hash duplicate rejection, against real Postgres", () => {
  async function createDraftFor(publisherId: string): Promise<string> {
    const { id } = await repository.save({
      publisherId,
      publisherType: "owner",
      propertyType: "apartamento",
      cityId: CITY,
      zoneId: ZONE,
      title: "Borrador importado",
      description: "x".repeat(140),
      priceUsd: 400,
      rooms: 2,
      areaM2: 60,
      bathrooms: 1,
      parkingSpots: 0,
      hasPowerPlant: false,
      hasRegularWater: false,
      isFurnished: false,
      hasSecurity: false,
      hasAppliances: false,
      contactMethod: "whatsapp",
      contactValue: "04121234567",
      status: "draft",
      publishedAt: new Date("2026-08-24T00:00:00.000Z"),
      expiresAt: new Date("2026-09-23T00:00:00.000Z"),
      photos: [],
      externalReference: `photo-attach-${publisherId}`,
    });
    return id;
  }

  it("rejects Diego's attach: his photo perceptually matches Ana's existing photo", async () => {
    const draftId = await createDraftFor(DIEGO);

    const failure = await attachPhotoToDraft(
      {
        listingId: draftId,
        incomingKey: incomingKeyFor(DIEGO),
        declaredContentType: "image/png",
      },
      {
        sessionPort: sessionFor(DIEGO),
        listings: activation,
        photos: activation,
        storage: fakeStorage(),
        derive: fakeDerive,
        computeHash: computeHashReturning(NEAR),
        photoHashes,
        now: () => new Date("2026-08-24T10:20:00.000Z"),
      },
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RejectedUploadError);
    expect((failure as RejectedUploadError).violations).toEqual([
      "photo.duplicateAcrossPublishers",
    ]);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "listing_photo" WHERE listing_id = $1`,
      [draftId],
    );
    expect(rows[0]?.n).toBe(0);
  });

  it("attaches Elena's non-matching photo, and records its hash keyed to the real photo id", async () => {
    const draftId = await createDraftFor(ELENA);

    const result = await attachPhotoToDraft(
      {
        listingId: draftId,
        incomingKey: incomingKeyFor(ELENA),
        declaredContentType: "image/png",
      },
      {
        sessionPort: sessionFor(ELENA),
        listings: activation,
        photos: activation,
        storage: fakeStorage(),
        derive: fakeDerive,
        computeHash: computeHashReturning(FAR2_HASH),
        photoHashes,
        now: () => new Date("2026-08-24T10:25:00.000Z"),
      },
    );

    expect(result).toEqual({ listingId: draftId, position: 0 });

    const { rows } = await pool.query(`SELECT id FROM "listing_photo" WHERE listing_id = $1`, [
      draftId,
    ]);
    const photoId = rows[0]?.id as string;
    expect(await recordedHashFor(photoId)).toBe(bits(FAR2_HASH));
  });
});
