import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * D5 (design.md): "zone has UNIQUE (id, city_id); listing carries a
 * composite foreign key (zone_id, city_id) -> zone(id, city_id). A
 * Maracaibo listing physically cannot hold a Distrito Capital zone."
 *
 * This file used to build its own three-column probe table, because
 * `listing` did not exist yet and a primary key on `zone.id` alone is
 * already unique regardless of `city_id` — the compound uniqueness only
 * becomes observable once something references it. **Task 3.1 shipped the
 * real table, so the probe is gone**: this now exercises the constraint the
 * product actually carries, on the table the product actually writes to.
 * The probe proved that the shape was possible; this proves that the
 * shipped schema does it.
 *
 * This MUST run against real Postgres, not an emulator or a fake repository
 * (design.md, Testing Strategy): the guarantee lives in a database
 * constraint, so only the database can refuse the write. A unit test with
 * an in-memory port fake would prove that application code declined to
 * try, which is not what D5 promises.
 */

function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. This integration test needs a real Postgres " +
        'instance (see .github/workflows/ci.yml\'s "integration" job, which starts one ' +
        "automatically) — or run one locally with `pnpm db:test:up && pnpm db:test:migrate`.",
    );
  }
  return url;
}

const client = new Client({ connectionString: getTestDatabaseUrl() });

/** A publisher row, because `listing.publisher_id` references `user`. */
async function insertPublisher(): Promise<string> {
  const id = randomUUID();
  await client.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [
    id,
    `${id}@rentas.invalid`,
  ]);
  return id;
}

function listingValues(publisherId: string, zoneId: string, cityId: string) {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return [
    randomUUID(),
    publisherId,
    "owner",
    cityId,
    zoneId,
    "Apartamento 2 habitaciones con puesto de estacionamiento",
    "Piso alto, planta eléctrica y vigilancia 24 horas.",
    450,
    2,
    72,
    "active",
    now,
    in30Days,
  ];
}

const INSERT_LISTING = `
  INSERT INTO "listing"
    (id, publisher_id, publisher_type, city_id, zone_id, title, description,
     price_usd, rooms, area_m2, contact_method, contact_value, status, published_at, expires_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'whatsapp','04121234567',$11,$12,$13)
`;

describe("D5 city isolation — listing(zone_id, city_id) -> zone(id, city_id)", () => {
  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("rejects a listing whose city does not match its zone's real city", async () => {
    const publisherId = await insertPublisher();
    const capitalId = randomUUID();
    const maracaiboId = randomUUID();
    const zoneId = randomUUID();

    await client.query('INSERT INTO "city" (id, name) VALUES ($1, $2), ($3, $4)', [
      capitalId,
      `Distrito Capital ${capitalId}`,
      maracaiboId,
      `Maracaibo ${maracaiboId}`,
    ]);
    await client.query('INSERT INTO "zone" (id, city_id, name) VALUES ($1, $2, $3)', [
      zoneId,
      capitalId,
      `Chacao ${zoneId}`,
    ]);

    // The cross-city reference: this zone genuinely belongs to `capitalId`,
    // so pairing it with `maracaiboId` is exactly the row D5 says must be
    // unrepresentable. Postgres, not application code, must refuse it.
    await expect(
      client.query(INSERT_LISTING, listingValues(publisherId, zoneId, maracaiboId)),
    ).rejects.toMatchObject({ code: "23503" }); // foreign_key_violation

    // Sanity check: the same zone paired with its real city succeeds, which
    // is what proves the rejection above is about the city mismatch and not
    // a malformed statement or a missing table.
    await expect(
      client.query(INSERT_LISTING, listingValues(publisherId, zoneId, capitalId)),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  // tasks.md 3.3 — the same argument as the composite key, applied to the
  // publisher type. A DEFAULT here would turn "the caller forgot" into
  // "everyone is an owner", and the owner/broker distinction is a trust
  // guarantee, not a display preference.
  it("rejects a listing with no publisher_type, applying no default", async () => {
    const publisherId = await insertPublisher();
    const cityId = randomUUID();
    const zoneId = randomUUID();

    await client.query('INSERT INTO "city" (id, name) VALUES ($1, $2)', [
      cityId,
      `Distrito Capital ${cityId}`,
    ]);
    await client.query('INSERT INTO "zone" (id, city_id, name) VALUES ($1, $2, $3)', [
      zoneId,
      cityId,
      `Altamira ${zoneId}`,
    ]);

    await expect(
      client.query(
        `INSERT INTO "listing"
           (id, publisher_id, city_id, zone_id, title, description,
            price_usd, rooms, area_m2, contact_method, contact_value, status, published_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'whatsapp','04121234567',$10,$11,$12)`,
        [
          randomUUID(),
          publisherId,
          cityId,
          zoneId,
          "Estudio en Altamira, ideal para una persona",
          "Amoblado, agua regular, línea blanca incluida.",
          320,
          1,
          38,
          "active",
          new Date(),
          new Date(),
        ],
      ),
    ).rejects.toMatchObject({ code: "23502" }); // not_null_violation
  });
});
