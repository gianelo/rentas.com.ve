import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { confirmImport } from "../../src/modules/broker-bulk-import/application/confirm-import";
import type { ImportFileSourcePort } from "../../src/modules/broker-bulk-import/application/ports/import-file-source.port";
import { DrizzleBulkImportAccounts } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import { DrizzleImportAccountContact } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-import-account-contact";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../src/modules/identity/application/ports/session.port";
import {
  AttachPhotoToDraftLimitReachedError,
  AttachPhotoToDraftNotFoundError,
  AttachPhotoToDraftNotOwnedError,
  attachPhotoToDraft,
} from "../../src/modules/listing-publication/application/attach-photo-to-draft";
import type { PhotoDerivationPort } from "../../src/modules/listing-publication/application/ports/photo-derivation.port";
import type { PhotoHashComputationPort } from "../../src/modules/listing-publication/application/ports/photo-hash-computation.port";
import type {
  PhotoStoragePort,
  StoredObject,
  UploadTarget,
} from "../../src/modules/listing-publication/application/ports/photo-storage.port";
import { MAX_PHOTOS_PER_LISTING } from "../../src/modules/listing-publication/domain/publishable-listing";
import {
  DrizzleListingActivation,
  DrizzleListingRepository,
  DrizzleZoneCatalogue,
  type PublicationDatabase,
} from "../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import type { PhotoHashPort } from "../../src/modules/listing-trust/application/ports/photo-hash.port";
import { toPerceptualHash } from "../../src/modules/listing-trust/domain/perceptual-hash";
import * as schema from "../../src/shared/db/schema";

/**
 * broker-bulk-import spec, "Photos Attached Through the Existing Upload
 * Path" (tasks.md 9.20/9.21), against real Postgres.
 *
 * **Why this cannot stay a fake-only guarantee.** Slice C's `isUniqueViolation`
 * passed every fake-based test and only failed against the real driver
 * (tasks.md 9.17); slice D proved its `WHERE` clauses the same way. Ownership
 * here is a `SELECT ... WHERE id = $1 AND status = 'draft'` read followed by
 * a real `INSERT` — a fake proves the CODE PATH, not that broker B's session
 * is actually refused against a row broker A actually owns in a real table.
 *
 * Every draft here is created through `confirmImport`, the real write path
 * (tasks.md 9.15/9.17), exactly like `listing-activation.test.ts` — so this
 * file also re-proves a freshly imported draft starts at zero photos.
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

const listingsRepo = new DrizzleListingRepository(db as unknown as PublicationDatabase);
const activation = new DrizzleListingActivation(db as unknown as PublicationDatabase);
const zones = new DrizzleZoneCatalogue(db as unknown as PublicationDatabase);
const accounts = new DrizzleBulkImportAccounts(db as unknown as PublicationDatabase);
const contact = new DrizzleImportAccountContact(db as unknown as PublicationDatabase);

let cityCounter = 0;
async function makeCityAndZone(): Promise<{ readonly cityId: string; readonly zoneId: string }> {
  cityCounter += 1;
  const cityId = `city-photo-attach-${cityCounter}`;
  const zoneId = `zone-photo-attach-${cityCounter}`;
  await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [cityId, `Ciudad ${cityId}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [zoneId, cityId, `Zona ${zoneId}`],
  );
  return { cityId, zoneId };
}

const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

function requiredHeader(): string {
  return "referencia_externa,titulo,descripcion,precio_usd,ciudad,zona,tipo_inmueble,habitaciones,banos,metros2";
}

function rowLine(externalReference: string, cityId: string, zoneId: string): string {
  return `${externalReference},Titulo del aviso,"${VALID_DESCRIPTION}",450,${cityId},${zoneId},apartamento,2,2,78`;
}

function sourceFromText(text: string): ImportFileSourcePort {
  const bytes = new TextEncoder().encode(text);
  return {
    declaredByteLength: bytes.byteLength,
    async *chunks() {
      yield bytes;
    },
  };
}

function sessionFor(userId: string): SessionPort {
  const session: AuthenticatedSession = { userId, email: null, name: null };
  return { getSession: async () => session };
}

let userCounter = 0;
const USER_IDS: string[] = [];
const CITY_IDS: string[] = [];

async function insertUser(): Promise<string> {
  userCounter += 1;
  const id = `broker-photo-attach-${userCounter}`;
  USER_IDS.push(id);
  await pool.query(
    `INSERT INTO "user" (id, name, email, bulk_import_enabled, contact_method, contact_value)
     VALUES ($1,$2,$3,true,'whatsapp','04121234567')`,
    [id, "Broker", `${id}@example.com`],
  );
  return id;
}

/** Imports exactly one draft for `userId`, and returns its id. */
async function importOneDraft(
  userId: string,
  externalReference: string,
  cityId: string,
  zoneId: string,
): Promise<string> {
  await confirmImport(
    sourceFromText(`${requiredHeader()}\n${rowLine(externalReference, cityId, zoneId)}`),
    {
      sessionPort: sessionFor(userId),
      accounts,
      contact,
      zones,
      listings: listingsRepo,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    },
  );

  const { rows } = await pool.query(
    `SELECT id FROM "listing" WHERE publisher_id = $1 AND external_reference = $2`,
    [userId, externalReference],
  );
  return rows[0].id as string;
}

async function photoCountFor(listingId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM "listing_photo" WHERE listing_id = $1`,
    [listingId],
  );
  return rows[0].n as number;
}

/** A real PNG header — `processUploadedPhoto`'s guard reads real bytes. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const TOKEN = "9c1d4e6f8a2b0c3d5e7f9a1b3c5d7e9f";

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

function incomingKeyFor(publisherId: string): string {
  return `incoming/${publisherId}/${TOKEN}`;
}

/**
 * The D4 duplicate check itself is proven end-to-end against real Postgres
 * in tests/integration/photo-duplicate-rejection.test.ts (task 4.7). Here
 * the scope is ownership and the photo-count ceiling, so `computeHash` and
 * `photoHashes` stay fakes — a fixed real adapter with a fixed hash would
 * make every broker in this file collide with every other broker's photos.
 */
const fakeComputeHash: PhotoHashComputationPort = async () => toPerceptualHash(BigInt(Date.now()));

function noMatchPhotoHashes(): PhotoHashPort {
  return {
    async findMatchesFromOtherPublishers() {
      return [];
    },
    async record() {},
  };
}

afterAll(async () => {
  if (USER_IDS.length > 0) {
    await pool.query(`DELETE FROM "user" WHERE id = ANY($1)`, [USER_IDS]);
  }
  if (CITY_IDS.length > 0) {
    await pool.query(`DELETE FROM "zone" WHERE city_id = ANY($1)`, [CITY_IDS]);
    await pool.query(`DELETE FROM "city" WHERE id = ANY($1)`, [CITY_IDS]);
  }
  await pool.end();
});

describe("attachPhotoToDraft — against real Postgres", () => {
  it("refuses another broker's draft — broker B cannot attach a photo to broker A's draft (tasks.md 9.20)", async () => {
    const { cityId, zoneId } = await makeCityAndZone();
    CITY_IDS.push(cityId);
    const ownerA = await insertUser();
    const strangerB = await insertUser();
    const draftId = await importOneDraft(ownerA, "PHOTO-NOT-OWNED", cityId, zoneId);

    await expect(
      attachPhotoToDraft(
        {
          listingId: draftId,
          incomingKey: incomingKeyFor(strangerB),
          declaredContentType: "image/png",
        },
        {
          sessionPort: sessionFor(strangerB),
          listings: activation,
          photos: activation,
          storage: fakeStorage(),
          derive: fakeDerive,
          computeHash: fakeComputeHash,
          photoHashes: noMatchPhotoHashes(),
          now: () => new Date(),
        },
      ),
    ).rejects.toBeInstanceOf(AttachPhotoToDraftNotOwnedError);

    // Broker A's draft still has zero photos — the stranger's attempt
    // wrote nothing.
    expect(await photoCountFor(draftId)).toBe(0);
  });

  it("throws AttachPhotoToDraftNotFoundError for an id that is not currently a draft", async () => {
    await expect(
      attachPhotoToDraft(
        {
          listingId: "00000000-0000-0000-0000-000000000000",
          incomingKey: incomingKeyFor("nobody"),
          declaredContentType: "image/png",
        },
        {
          sessionPort: sessionFor("nobody"),
          listings: activation,
          photos: activation,
          storage: fakeStorage(),
          derive: fakeDerive,
          computeHash: fakeComputeHash,
          photoHashes: noMatchPhotoHashes(),
          now: () => new Date(),
        },
      ),
    ).rejects.toBeInstanceOf(AttachPhotoToDraftNotFoundError);
  });

  it("the legitimate owner attaches a photo: the row lands, at position 0", async () => {
    const { cityId, zoneId } = await makeCityAndZone();
    CITY_IDS.push(cityId);
    const owner = await insertUser();
    const draftId = await importOneDraft(owner, "PHOTO-OWNED", cityId, zoneId);

    const result = await attachPhotoToDraft(
      {
        listingId: draftId,
        incomingKey: incomingKeyFor(owner),
        declaredContentType: "image/png",
      },
      {
        sessionPort: sessionFor(owner),
        listings: activation,
        photos: activation,
        storage: fakeStorage(),
        derive: fakeDerive,
        computeHash: fakeComputeHash,
        photoHashes: noMatchPhotoHashes(),
        now: () => new Date("2026-03-01T00:00:00.000Z"),
      },
    );

    expect(result).toEqual({ listingId: draftId, position: 0 });
    expect(await photoCountFor(draftId)).toBe(1);
  });

  it("refuses a photo past the ceiling, and writes no additional row", async () => {
    const { cityId, zoneId } = await makeCityAndZone();
    CITY_IDS.push(cityId);
    const owner = await insertUser();
    const draftId = await importOneDraft(owner, "PHOTO-CEILING", cityId, zoneId);

    for (let i = 0; i < MAX_PHOTOS_PER_LISTING; i++) {
      await attachPhotoToDraft(
        {
          listingId: draftId,
          incomingKey: incomingKeyFor(owner),
          declaredContentType: "image/png",
        },
        {
          sessionPort: sessionFor(owner),
          listings: activation,
          photos: activation,
          storage: fakeStorage(),
          derive: fakeDerive,
          computeHash: fakeComputeHash,
          photoHashes: noMatchPhotoHashes(),
          now: () => new Date("2026-03-01T00:00:00.000Z"),
        },
      );
    }

    expect(await photoCountFor(draftId)).toBe(MAX_PHOTOS_PER_LISTING);

    await expect(
      attachPhotoToDraft(
        {
          listingId: draftId,
          incomingKey: incomingKeyFor(owner),
          declaredContentType: "image/png",
        },
        {
          sessionPort: sessionFor(owner),
          listings: activation,
          photos: activation,
          storage: fakeStorage(),
          derive: fakeDerive,
          computeHash: fakeComputeHash,
          photoHashes: noMatchPhotoHashes(),
          now: () => new Date("2026-03-01T00:00:00.000Z"),
        },
      ),
    ).rejects.toBeInstanceOf(AttachPhotoToDraftLimitReachedError);

    expect(await photoCountFor(draftId)).toBe(MAX_PHOTOS_PER_LISTING);
  });
});
