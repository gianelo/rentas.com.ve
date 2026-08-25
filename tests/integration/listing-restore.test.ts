import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { restoreListing } from "../../src/modules/listing-trust/application/restore-listing";
import {
  DrizzleListingModeration,
  DrizzleModerationActions,
} from "../../src/modules/listing-trust/infrastructure/drizzle-listing-moderation";
import type { TrustDatabase } from "../../src/modules/listing-trust/infrastructure/drizzle-photo-hash";
import * as schema from "../../src/shared/db/schema";

/**
 * listing-trust spec, Requirement: Operator Restore (tasks.md 8.5/8.6).
 *
 * What only Postgres can answer, and why it is here and not only in
 * restore-listing.test.ts (which already covers the use case's own logic
 * against recording fakes): the status transitions this feature writes
 * (`hidden → active`, `hidden → expired`) and the `moderation_action` insert
 * actually persist and are read back correctly through Drizzle's real
 * driver, against the real `ON DELETE restrict` foreign key.
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

const listings = new DrizzleListingModeration(db);
const moderationActions = new DrizzleModerationActions(db);

const CITY = randomUUID();
const ZONE = randomUUID();
const PUBLISHER = randomUUID();

async function insertListing(id: string, status: string, expiresAt: Date): Promise<void> {
  await pool.query(
    `INSERT INTO "listing"
       (id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
        price_usd, rooms, area_m2, bathrooms, parking_spots,
        has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
        contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,'Apartamento restaurable','Descripción larga.',
             450,2,78,1,0, false,false,false,false,false,
             'email','sin-contacto',$5, now() - interval '30 days', $6)`,
    [id, PUBLISHER, CITY, ZONE, status, expiresAt],
  );
}

async function readListingStatus(id: string): Promise<string | undefined> {
  const { rows } = await pool.query('SELECT status FROM "listing" WHERE id = $1', [id]);
  return rows[0]?.status;
}

beforeAll(async () => {
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2)', [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [ZONE, CITY, `Zona ${ZONE}`],
  );
  await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1,$2,$3)', [
    PUBLISHER,
    "Publicador",
    `publicador-${PUBLISHER}@example.com`,
  ]);
});

afterAll(async () => {
  // Same discipline as tests/integration/contact-reveal.test.ts and
  // tests/integration/listing-report.test.ts: `moderation_action` is `ON
  // DELETE restrict` on purpose (evidence, not a disposable row), so it must
  // be cleared before `listing` or seed.test.ts's own `DELETE FROM
  // "listing"` fails on a foreign-key violation for a completely different
  // test file.
  await pool.query(
    `DELETE FROM "moderation_action" WHERE listing_id = ANY(
    SELECT id FROM "listing" WHERE city_id = $1
  )`,
    [CITY],
  );
  await pool.query(`DELETE FROM "listing" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "user" WHERE id = $1`, [PUBLISHER]);
  await pool.query(`DELETE FROM "zone" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "city" WHERE id = $1`, [CITY]);
  await pool.end();
});

describe("restoreListing — vuelve a activo y deja rastro en moderation_action", () => {
  const listingId = randomUUID();
  const future = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    await insertListing(listingId, "hidden", future);
  });

  it("restores to active and writes exactly one moderation_action row", async () => {
    const result = await restoreListing({ listingId }, { listings, moderationActions });

    expect(result.status).toBe("active");
    expect(await readListingStatus(listingId)).toBe("active");

    const { rows } = await pool.query(
      'SELECT action FROM "moderation_action" WHERE listing_id = $1',
      [listingId],
    );
    expect(rows).toEqual([{ action: "restore" }]);
  });
});

describe("restoreListing — no resucita un aviso que ya venció mientras estaba escondido", () => {
  const listingId = randomUUID();
  const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    await insertListing(listingId, "hidden", past);
  });

  // "provided it has not also expired" — the spec's own caveat, proven
  // against a real row whose `expires_at` sits in the past.
  it("returns to expired instead of active", async () => {
    const result = await restoreListing({ listingId }, { listings, moderationActions });

    expect(result.status).toBe("expired");
    expect(await readListingStatus(listingId)).toBe("expired");
  });
});

describe("restoreListing — un aviso que no está escondido no tiene nada que restaurar", () => {
  const listingId = randomUUID();
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    await insertListing(listingId, "active", future);
  });

  it("refuses and writes no moderation_action row", async () => {
    await expect(restoreListing({ listingId }, { listings, moderationActions })).rejects.toThrow();

    expect(await readListingStatus(listingId)).toBe("active");
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM "moderation_action" WHERE listing_id = $1',
      [listingId],
    );
    expect(rows[0].n).toBe(0);
  });
});
