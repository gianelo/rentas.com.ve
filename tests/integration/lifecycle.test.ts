import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renewedExpiry } from "../../src/modules/listing-lifecycle/domain/expiry";
import {
  DrizzleJobRuns,
  DrizzleLifecycleListings,
  DrizzleListingPhotoPurge,
  DrizzleReminderLedger,
  type LifecycleDatabase,
} from "../../src/modules/listing-lifecycle/infrastructure/drizzle-lifecycle";
import {
  DrizzleListingSearch,
  type SearchDatabase,
} from "../../src/modules/listing-search/infrastructure/drizzle-listing-search";
import * as schema from "../../src/shared/db/schema";

/**
 * El ciclo de vida contra Postgres real.
 *
 * Cuatro cosas que **sólo la base puede contestar**, y por eso están acá y no
 * en un doble escrito para pasar:
 *
 * 1. La restricción única de `listing_reminder` — que el segundo `INSERT`
 *    pierda es cosa del índice, no del código.
 * 2. Que la clave de TRES columnas deje convivir los dos correos del mismo
 *    ciclo. Con dos, el de purga no saldría nunca.
 * 3. Que el `UPDATE` condicionado afecte cero filas al repetir el token.
 * 4. Que borrar las fotos se lleve las derivadas por cascada y **NO** toque la
 *    fila del aviso.
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
const handle = db as unknown as LifecycleDatabase;

const listings = new DrizzleLifecycleListings(handle);
const ledger = new DrizzleReminderLedger(handle);
const jobRuns = new DrizzleJobRuns(handle);
const purge = new DrizzleListingPhotoPurge(handle);
const search = new DrizzleListingSearch(db as unknown as SearchDatabase);

const CITY = randomUUID();
const ZONE = randomUUID();
const PUBLISHER = randomUUID();

async function insertListing(
  id: string,
  status: string,
  expiresAt: Date,
  title = "Apartamento 2 habitaciones",
): Promise<void> {
  await pool.query(
    `INSERT INTO "listing"
       (id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
        price_usd, rooms, area_m2, bathrooms, parking_spots,
        has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
        contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,$5,'Descripción larga.',
             450,2,78,1,0, false,false,false,false,false,
             'email','sin-contacto',$6, now() - interval '30 days', $7)`,
    [id, PUBLISHER, CITY, ZONE, title, status, expiresAt],
  );
}

async function readListing(id: string) {
  const { rows } = await pool.query(
    'SELECT status, expires_at, last_renewed_at, title FROM "listing" WHERE id = $1',
    [id],
  );
  return rows[0] as
    | { status: string; expires_at: Date; last_renewed_at: Date | null; title: string }
    | undefined;
}

async function insertPhoto(listingId: string, position: number): Promise<string> {
  const photoId = randomUUID();
  await pool.query(
    'INSERT INTO "listing_photo" (id, listing_id, position, created_at) VALUES ($1,$2,$3, now())',
    [photoId, listingId, position],
  );
  await pool.query(
    'INSERT INTO "listing_photo_derivative" (photo_id, name, key, bytes) VALUES ($1,$2,$3,$4)',
    [photoId, "card", `listings/${listingId}/${photoId}/card.webp`, 12_345],
  );
  return photoId;
}

beforeAll(async () => {
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2)', [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [ZONE, CITY, `Zona ${ZONE}`],
  );
  await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1,$2,$3)', [
    PUBLISHER,
    "María",
    `maria-${PUBLISHER}@example.com`,
  ]);
});

afterAll(async () => {
  await pool.end();
});

describe("listing_reminder — la restricción es la garantía", () => {
  const listingId = randomUUID();
  const expiresAt = new Date("2026-08-31T10:00:00.000Z");

  beforeAll(async () => {
    await insertListing(listingId, "active", expiresAt);
  });

  // **La mutación que carga el peso.** Si el caso de uso preguntara antes de
  // escribir, dos corridas superpuestas mandarían las dos. Acá el segundo
  // `INSERT` pierde contra el índice, y eso lo decide Postgres.
  it("la segunda reserva del mismo correo pierde", async () => {
    const claim = { listingId, kind: "expiry" as const, expiresAt, sentAt: new Date() };

    expect(await ledger.claim(claim)).toBe(true);
    expect(await ledger.claim(claim)).toBe(false);

    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM "listing_reminder" WHERE listing_id = $1',
      [listingId],
    );
    expect(rows[0].n).toBe(1);
  });

  // Por qué la clave lleva TRES columnas: los dos correos del mismo ciclo
  // tienen que poder convivir. Con `(listing_id, expires_at)` este `claim`
  // devolvería `false` y el aviso de purga no saldría nunca.
  it("el correo de purga del mismo ciclo se reserva aparte", async () => {
    expect(await ledger.claim({ listingId, kind: "purge", expiresAt, sentAt: new Date() })).toBe(
      true,
    );
  });

  it("el ciclo siguiente vuelve a ganarse su correo", async () => {
    expect(
      await ledger.claim({
        listingId,
        kind: "expiry",
        expiresAt: new Date("2026-09-30T10:00:00.000Z"),
        sentAt: new Date(),
      }),
    ).toBe(true);
  });

  it("devolver la reserva permite reintentar", async () => {
    const otherListing = randomUUID();
    await insertListing(otherListing, "active", expiresAt);
    const claim = { listingId: otherListing, kind: "expiry" as const, expiresAt };

    expect(await ledger.claim({ ...claim, sentAt: new Date() })).toBe(true);
    await ledger.release(claim);
    expect(await ledger.claim({ ...claim, sentAt: new Date() })).toBe(true);
  });
});

describe("renovación — el token se quema con el propio UPDATE", () => {
  const listingId = randomUUID();
  const expiresAt = new Date("2026-08-31T10:00:00.000Z");

  beforeAll(async () => {
    await insertListing(listingId, "active", expiresAt);
  });

  it("renueva una vez y la repetición no afecta ninguna fila", async () => {
    const renewedAt = new Date("2026-08-29T10:00:00.000Z");
    const newExpiresAt = renewedExpiry(renewedAt);

    expect(
      await listings.renew({ listingId, expectedExpiresAt: expiresAt, newExpiresAt, renewedAt }),
    ).toBe(true);

    // El mismo token, otra vez. `expires_at` ya no vale lo que firmó.
    expect(
      await listings.renew({
        listingId,
        expectedExpiresAt: expiresAt,
        newExpiresAt: renewedExpiry(new Date("2026-08-30T10:00:00.000Z")),
        renewedAt: new Date("2026-08-30T10:00:00.000Z"),
      }),
    ).toBe(false);

    const row = await readListing(listingId);
    expect(row?.expires_at).toEqual(newExpiresAt);
    expect(row?.last_renewed_at).toEqual(renewedAt);
  });
});

describe("vencer — se conserva, sale de la búsqueda y sigue renovable", () => {
  const expiring = randomUUID();
  const hiddenId = randomUUID();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    await insertListing(expiring, "active", past, `Vencido ${expiring}`);
    await insertListing(hiddenId, "hidden", past, `Escondido ${hiddenId}`);
  });

  it("marca vencido sin borrar la fila", async () => {
    const before = await readListing(expiring);
    expect(before?.status).toBe("active");

    await listings.markExpired(new Date());

    const after = await readListing(expiring);
    // **Se conserva**: la fila sigue ahí, con su título y su fecha.
    expect(after).toBeDefined();
    expect(after?.status).toBe("expired");
    expect(after?.title).toBe(`Vencido ${expiring}`);
  });

  // Un aviso escondido por reportes que venciera y después renovara volvería a
  // `active`: el camino por el que un aviso reportado se lava solo.
  it("no toca un aviso escondido por reportes", async () => {
    expect((await readListing(hiddenId))?.status).toBe("hidden");
  });

  it("sale de la búsqueda", async () => {
    const results = await search.search({ cityId: CITY });
    expect(results.map((row) => row.id)).not.toContain(expiring);
  });

  it("sigue siendo renovable, y renovarlo lo devuelve a la búsqueda", async () => {
    const row = await readListing(expiring);
    const renewedAt = new Date();

    expect(
      await listings.renew({
        listingId: expiring,
        // biome-ignore lint/style/noNonNullAssertion: la fila se acaba de leer arriba.
        expectedExpiresAt: row!.expires_at,
        newExpiresAt: renewedExpiry(renewedAt),
        renewedAt,
      }),
    ).toBe(true);

    expect((await readListing(expiring))?.status).toBe("active");
    const results = await search.search({ cityId: CITY });
    expect(results.map((entry) => entry.id)).toContain(expiring);
  });
});

describe("purga — borra las fotos y deja el aviso", () => {
  const listingId = randomUUID();
  const longExpired = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  let photoIds: string[];

  beforeAll(async () => {
    await insertListing(listingId, "expired", longExpired, `A purgar ${listingId}`);
    photoIds = [await insertPhoto(listingId, 0), await insertPhoto(listingId, 1)];
  });

  it("encuentra las fotos y sus claves de R2", async () => {
    const candidates = await purge.candidates(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000));
    const mine = candidates.find((candidate) => candidate.listingId === listingId);

    expect([...(mine?.photoIds ?? [])].sort()).toEqual([...photoIds].sort());
    expect(mine?.objectKeys).toHaveLength(2);
  });

  // **La mutación que carga el peso.** Después de purgar: cero fotos, cero
  // derivadas, y la fila del aviso EXACTAMENTE como estaba.
  it("borra fotos y derivadas y deja el aviso intacto", async () => {
    const before = await readListing(listingId);

    expect(await purge.deletePhotos(photoIds)).toBe(2);

    const photos = await pool.query(
      'SELECT count(*)::int AS n FROM "listing_photo" WHERE listing_id = $1',
      [listingId],
    );
    expect(photos.rows[0].n).toBe(0);

    const derivatives = await pool.query(
      'SELECT count(*)::int AS n FROM "listing_photo_derivative" WHERE photo_id = ANY($1)',
      [photoIds],
    );
    expect(derivatives.rows[0].n).toBe(0);

    const after = await readListing(listingId);
    expect(after).toEqual(before);
  });
});

describe("job_run — la corrida deja rastro", () => {
  it("guarda conteos y fallas", async () => {
    const startedAt = new Date();
    await jobRuns.record({
      job: "expiry-reminders",
      startedAt,
      finishedAt: new Date(startedAt.getTime() + 1200),
      selected: 12,
      succeeded: 10,
      skipped: 1,
      failed: 1,
      failureDetail: "aviso-x: proveedor caído",
    });

    const { rows } = await pool.query(
      `SELECT selected, succeeded, skipped, failed, failure_detail FROM "job_run"
       WHERE job = 'expiry-reminders' ORDER BY started_at DESC LIMIT 1`,
    );
    expect(rows[0]).toEqual({
      selected: 12,
      succeeded: 10,
      skipped: 1,
      failed: 1,
      failure_detail: "aviso-x: proveedor caído",
    });
  });
});
