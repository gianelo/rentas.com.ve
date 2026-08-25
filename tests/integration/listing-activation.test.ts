import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmImport } from "../../src/modules/broker-bulk-import/application/confirm-import";
import type { ImportFileSourcePort } from "../../src/modules/broker-bulk-import/application/ports/import-file-source.port";
import { DrizzleBulkImportAccounts } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import { DrizzleImportAccountContact } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-import-account-contact";
import {
  type ContactRevealDatabase,
  DrizzleRevealableListing,
} from "../../src/modules/contact-reveal/infrastructure/drizzle-contact-reveal";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../src/modules/identity/application/ports/session.port";
import {
  DrizzleLifecycleListings,
  type LifecycleDatabase,
} from "../../src/modules/listing-lifecycle/infrastructure/drizzle-lifecycle";
import {
  ActivateListingNotFoundError,
  ActivateListingNotOwnedError,
  ActivateListingRejectedError,
  activateListing,
} from "../../src/modules/listing-publication/application/activate-listing";
import {
  DrizzleListingActivation,
  DrizzleListingRepository,
  DrizzleZoneCatalogue,
  type PublicationDatabase,
} from "../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import {
  DrizzleListingSearch,
  type SearchDatabase,
} from "../../src/modules/listing-search/infrastructure/drizzle-listing-search";
import { DrizzleListingModeration } from "../../src/modules/listing-trust/infrastructure/drizzle-listing-moderation";
import type { TrustDatabase } from "../../src/modules/listing-trust/infrastructure/drizzle-photo-hash";
import * as schema from "../../src/shared/db/schema";

/**
 * broker-bulk-import spec, "Drafts Are Not Published Listings" (tasks.md
 * 9.18/9.19), against real Postgres.
 *
 * **Five of the seven exclusions are enforced by a SQL `WHERE`, and a unit
 * test with a fake cannot prove a `WHERE` clause — it proves the fake.**
 * Everything asserted here is either a query's `WHERE`
 * (`listing-search`, `contact-reveal`, `listing-lifecycle`'s
 * `noticeCandidates`/`markExpired`, and the two soft spots this slice closed
 * — `findRenewable`/`findModerated`) or a write the compare-and-swap
 * `activate` performs. None of it is provable against an in-memory fake.
 *
 * Every draft here is created through `confirmImport` rather than a raw
 * `INSERT`, on purpose: it is the real write path (tasks.md 9.15/9.17), and
 * using it means this file also re-proves that a freshly imported draft
 * genuinely starts in the state these guarantees assume.
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
const search = new DrizzleListingSearch(db as unknown as SearchDatabase);
const revealable = new DrizzleRevealableListing(db as unknown as ContactRevealDatabase);
const lifecycle = new DrizzleLifecycleListings(db as unknown as LifecycleDatabase);
const moderation = new DrizzleListingModeration(db as unknown as TrustDatabase);

const CITY = randomUUID();
const ZONE = randomUUID();

const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

const REQUIRED_HEADER =
  "referencia_externa,titulo,descripcion,precio_usd,ciudad,zona,tipo_inmueble,habitaciones,banos,metros2";

function rowLine(externalReference: string): string {
  return `${externalReference},Titulo del aviso,"${VALID_DESCRIPTION}",450,${CITY},${ZONE},apartamento,2,2,78`;
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

const USER_IDS: string[] = [];

async function insertUser(id: string): Promise<void> {
  USER_IDS.push(id);
  await pool.query(
    `INSERT INTO "user" (id, name, email, bulk_import_enabled, contact_method, contact_value)
     VALUES ($1,$2,$3,true,'whatsapp','04121234567')`,
    [id, "Broker", `broker-${id}@example.com`],
  );
}

/** Imports exactly one draft for `userId`, and returns its id and expiresAt/publishedAt placeholder. */
async function importOneDraft(
  userId: string,
  externalReference: string,
  importedAt: Date,
): Promise<{ readonly id: string; readonly placeholderTimestamp: Date }> {
  await confirmImport(sourceFromText(`${REQUIRED_HEADER}\n${rowLine(externalReference)}`), {
    sessionPort: sessionFor(userId),
    accounts,
    contact,
    zones,
    listings: listingsRepo,
    now: () => importedAt,
  });

  const { rows } = await pool.query(
    `SELECT id, published_at FROM "listing" WHERE publisher_id = $1 AND external_reference = $2`,
    [userId, externalReference],
  );
  return { id: rows[0].id as string, placeholderTimestamp: rows[0].published_at as Date };
}

async function attachPhoto(listingId: string): Promise<void> {
  const photoId = randomUUID();
  await pool.query(
    `INSERT INTO "listing_photo" (id, listing_id, position, created_at) VALUES ($1,$2,0, now())`,
    [photoId, listingId],
  );
  await pool.query(
    `INSERT INTO "listing_photo_derivative" (photo_id, name, key, bytes) VALUES ($1,'card',$2,12345)`,
    [photoId, `listings/${listingId}/${photoId}/card.webp`],
  );
}

async function readListing(id: string) {
  const { rows } = await pool.query(
    `SELECT status, published_at, expires_at FROM "listing" WHERE id = $1`,
    [id],
  );
  return rows[0] as { status: string; published_at: Date; expires_at: Date } | undefined;
}

beforeAll(async () => {
  await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [ZONE, CITY, `Zona ${ZONE}`],
  );
});

afterAll(async () => {
  if (USER_IDS.length > 0) {
    await pool.query(`DELETE FROM "user" WHERE id = ANY($1)`, [USER_IDS]);
  }
  await pool.query(`DELETE FROM "zone" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "city" WHERE id = $1`, [CITY]);
  await pool.end();
});

describe("a draft is invisible everywhere, until activated — against real Postgres", () => {
  it("is excluded from search, contact reveal, renewal, and moderation lookups", async () => {
    const userId = randomUUID();
    await insertUser(userId);
    const importedAt = new Date("2026-01-01T00:00:00.000Z");
    const draft = await importOneDraft(userId, "ACT-INVISIBLE", importedAt);

    const results = await search.search({ cityId: CITY, page: 1 });
    expect(results.some((row) => row.id === draft.id)).toBe(false);

    expect(await revealable.findRevealable(draft.id)).toBeNull();

    // The two soft spots this slice closed (tasks.md 9.19): neither query
    // used to filter by status at all.
    expect(await lifecycle.findRenewable(draft.id)).toBeNull();
    expect(await moderation.findModerated(draft.id)).toBeNull();

    // noticeCandidates: the placeholder `expires_at` sits exactly at import
    // time, which is well inside the notice window if status were ignored —
    // proving the exclusion is really `status`, not a date that happens to
    // dodge the window today.
    const now = new Date(importedAt.getTime() + 24 * 60 * 60 * 1000);
    const candidates = await lifecycle.noticeCandidates(now);
    expect(candidates.some((row) => row.id === draft.id)).toBe(false);

    // markExpired: an `active`-only sweep, but proven here against a row
    // whose placeholder timestamp is already "expired" by any date
    // arithmetic that ignored status.
    await lifecycle.markExpired(now);
    const afterSweep = await readListing(draft.id);
    expect(afterSweep?.status).toBe("draft");
  });

  it("refuses activation with zero photos, naming photos.required, and writes nothing", async () => {
    const userId = randomUUID();
    await insertUser(userId);
    const importedAt = new Date("2026-01-02T00:00:00.000Z");
    const draft = await importOneDraft(userId, "ACT-NO-PHOTO", importedAt);

    const error = await activateListing(
      { listingId: draft.id },
      { sessionPort: sessionFor(userId), zones, listings: activation, now: () => new Date() },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ActivateListingRejectedError);
    expect((error as ActivateListingRejectedError).violations).toContain("photos.required");

    const row = await readListing(draft.id);
    expect(row?.status).toBe("draft");
    expect(row?.published_at).toEqual(draft.placeholderTimestamp);
  });

  it("refuses activation by a broker who does not own the draft, and writes nothing", async () => {
    const owner = randomUUID();
    const stranger = randomUUID();
    await insertUser(owner);
    await insertUser(stranger);
    const importedAt = new Date("2026-01-03T00:00:00.000Z");
    const draft = await importOneDraft(owner, "ACT-NOT-OWNED", importedAt);
    await attachPhoto(draft.id);

    await expect(
      activateListing(
        { listingId: draft.id },
        { sessionPort: sessionFor(stranger), zones, listings: activation, now: () => new Date() },
      ),
    ).rejects.toBeInstanceOf(ActivateListingNotOwnedError);

    const row = await readListing(draft.id);
    expect(row?.status).toBe("draft");
  });

  it("activates a draft with a photo: recomputes publishedAt/expiresAt from now, and it becomes visible", async () => {
    const userId = randomUUID();
    await insertUser(userId);
    const importedAt = new Date("2026-01-04T00:00:00.000Z");
    const activatedAt = new Date("2026-02-10T09:30:00.000Z"); // well after import
    const draft = await importOneDraft(userId, "ACT-VALID", importedAt);
    await attachPhoto(draft.id);

    const result = await activateListing(
      { listingId: draft.id },
      { sessionPort: sessionFor(userId), zones, listings: activation, now: () => activatedAt },
    );

    expect(result.publishedAt).toEqual(activatedAt);
    expect(result.expiresAt).toEqual(new Date(activatedAt.getTime() + 30 * 24 * 60 * 60 * 1000));

    const row = await readListing(draft.id);
    expect(row?.status).toBe("active");
    // Never the import's placeholder — the whole point of the spec scenario
    // "Expiry clock starts at activation, not at import".
    expect(row?.published_at).not.toEqual(draft.placeholderTimestamp);
    expect(row?.published_at).toEqual(activatedAt);
    expect(row?.expires_at).toEqual(new Date(activatedAt.getTime() + 30 * 24 * 60 * 60 * 1000));

    // Now visible everywhere it was excluded before.
    const results = await search.search({ cityId: CITY, page: 1 });
    expect(results.some((r) => r.id === draft.id)).toBe(true);
    expect(await revealable.findRevealable(draft.id)).not.toBeNull();
    expect(await lifecycle.findRenewable(draft.id)).not.toBeNull();
    expect(await moderation.findModerated(draft.id)).not.toBeNull();
  });

  it("a concurrent activation of the same draft cannot win twice (compare-and-swap)", async () => {
    const userId = randomUUID();
    await insertUser(userId);
    const draft = await importOneDraft(userId, "ACT-RACE", new Date("2026-01-05T00:00:00.000Z"));
    await attachPhoto(draft.id);

    const first = new Date("2026-02-11T10:00:00.000Z");
    const second = new Date("2026-02-11T10:00:05.000Z");

    const firstResult = await activation.activate(draft.id, first, new Date(first.getTime() + 1));
    const secondResult = await activation.activate(
      draft.id,
      second,
      new Date(second.getTime() + 1),
    );

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);

    const row = await readListing(draft.id);
    // The loser's write never landed — the row keeps the WINNER's timestamp.
    expect(row?.published_at).toEqual(first);
  });

  it("throws ActivateListingNotFoundError for an id that is not currently a draft", async () => {
    const userId = randomUUID();
    await insertUser(userId);
    const draft = await importOneDraft(
      userId,
      "ACT-ALREADY-ACTIVE",
      new Date("2026-01-06T00:00:00.000Z"),
    );
    await attachPhoto(draft.id);

    await activateListing(
      { listingId: draft.id },
      { sessionPort: sessionFor(userId), zones, listings: activation, now: () => new Date() },
    );

    await expect(
      activateListing(
        { listingId: draft.id },
        { sessionPort: sessionFor(userId), zones, listings: activation, now: () => new Date() },
      ),
    ).rejects.toBeInstanceOf(ActivateListingNotFoundError);
  });
});
