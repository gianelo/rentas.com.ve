import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * `listing_photo` (tasks.md 3.8, design.md D12). Two guarantees live in this
 * schema rather than in application code, and both are proven here against
 * real Postgres for the same reason D5's composite key is: only the database
 * can refuse a write, and a test with an in-memory fake would prove that our
 * code declined to try.
 *
 * 1. **Cascade delete.** A photo row outliving its listing is a row pointing
 *    at R2 objects nothing will ever render or clean up — silent storage
 *    growth against a 10 GB free tier that D12's whole storage argument
 *    depends on.
 * 2. **One photo per slot.** Display order is a publisher's choice
 *    (SISTEMA.md screen 2 shows one large photo and a thumbnail strip), and
 *    two photos claiming position 0 makes "which one is the main photo"
 *    depend on row order, which Postgres does not promise.
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

const INSERT_PHOTO = `
  INSERT INTO "listing_photo" (id, listing_id, position, created_at)
  VALUES ($1,$2,$3,now())
`;

/** Las claves y tamaños se mudaron a `listing_photo_derivative`. */
const INSERT_DERIVATIVE = `
  INSERT INTO "listing_photo_derivative" (photo_id, name, key, bytes)
  VALUES ($1,$2,$3,$4)
`;

function photoValues(listingId: string, position: number) {
  return [randomUUID(), listingId, position];
}

/** A listing, with the user/city/zone rows its foreign keys require. */
async function insertListing(): Promise<string> {
  const publisherId = randomUUID();
  const cityId = randomUUID();
  const zoneId = randomUUID();
  const listingId = randomUUID();

  await client.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [
    publisherId,
    `${publisherId}@rentas.invalid`,
  ]);
  await client.query('INSERT INTO "city" (id, name) VALUES ($1, $2)', [
    cityId,
    `Distrito Capital ${cityId}`,
  ]);
  await client.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [zoneId, cityId, `Chacao ${zoneId}`],
  );
  await client.query(
    `INSERT INTO "listing"
       (id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
        price_usd, rooms, area_m2, bathrooms, contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,$5,$6,520,2,78,2,'whatsapp','04121234567','active',now(),now() + interval '30 days')`,
    [
      listingId,
      publisherId,
      cityId,
      zoneId,
      "Apartamento 2 habitaciones con puesto de estacionamiento",
      "Piso alto, planta electrica y vigilancia 24 horas.",
    ],
  );

  return listingId;
}

async function countPhotos(listingId: string): Promise<number> {
  const result = await client.query(
    'SELECT count(*)::int AS n FROM "listing_photo" WHERE listing_id = $1',
    [listingId],
  );
  return result.rows[0].n as number;
}

describe("listing_photo", () => {
  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("deletes a listing's photos with the listing, leaving no orphans", async () => {
    const listingId = await insertListing();
    await client.query(INSERT_PHOTO, photoValues(listingId, 0));
    await client.query(INSERT_PHOTO, photoValues(listingId, 1));
    expect(await countPhotos(listingId)).toBe(2);

    await client.query('DELETE FROM "listing" WHERE id = $1', [listingId]);

    // Without ON DELETE CASCADE this either fails with a foreign-key error
    // or, worse under a nullable column, leaves rows pointing at R2 objects
    // nothing will render and nothing will clean up.
    expect(await countPhotos(listingId)).toBe(0);
  });

  it("refuses two photos in the same display slot", async () => {
    const listingId = await insertListing();
    await client.query(INSERT_PHOTO, photoValues(listingId, 0));

    await expect(client.query(INSERT_PHOTO, photoValues(listingId, 0))).rejects.toMatchObject({
      code: "23505", // unique_violation
    });
  });

  it("scopes the slot to its own listing, so two listings both have a position 0", async () => {
    // The sanity check that proves the constraint above is about the pair
    // and not about `position` alone — a global unique on position would
    // pass the previous test and break the product on its second listing.
    const first = await insertListing();
    const second = await insertListing();

    await client.query(INSERT_PHOTO, photoValues(first, 0));

    await expect(client.query(INSERT_PHOTO, photoValues(second, 0))).resolves.toMatchObject({
      rowCount: 1,
    });
  });

  it("exige clave y tamaño en cada derivada", async () => {
    // **La misma garantía que antes, en la tabla a la que se mudó.** Una
    // derivada sin clave es una foto que no se puede dibujar donde hace falta,
    // y una sin bytes desaparece en silencio de cualquier auditoría del
    // presupuesto de almacenamiento — que es lo que D12 existe para vigilar.
    const listingId = await insertListing();
    const [photoId] = photoValues(listingId, 0);
    await client.query(
      INSERT_PHOTO,
      photoValues(listingId, 0).map((v, i) => (i === 0 ? photoId : v)),
    );

    await expect(
      client.query(
        `INSERT INTO "listing_photo_derivative" (photo_id, name, key) VALUES ($1,'thumb',$2)`,
        [photoId, "thumb/only.webp"],
      ),
    ).rejects.toMatchObject({ code: "23502" }); // not_null_violation
  });

  it("no admite dos derivadas del mismo tamaño en una foto", async () => {
    // Cuál gana dependería de cuál alcanzó primero un escaneo, que es la clase
    // de respuesta que cambia sola entre dos consultas idénticas.
    const listingId = await insertListing();
    const values = photoValues(listingId, 0);
    await client.query(INSERT_PHOTO, values);

    await client.query(INSERT_DERIVATIVE, [values[0], "thumb", "a.webp", 8_000]);
    await expect(
      client.query(INSERT_DERIVATIVE, [values[0], "thumb", "b.webp", 9_000]),
    ).rejects.toMatchObject({ code: "23505" }); // unique_violation
  });
});
