import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DrizzleListingPhotos,
  type PhotosDatabase,
} from "../../src/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import * as schema from "../../src/shared/db/schema";

/**
 * `DrizzleListingPhotos` contra Postgres real.
 *
 * **Lo que sólo la base puede contestar** es que la portada de veinte avisos se
 * resuelva en UNA consulta. Un fake devolvería lo mismo con cualquier número de
 * viajes; el N+1 es invisible hasta que se mide contra un motor, y en
 * serverless sobre HTTP cuesta latencia real.
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
const db = drizzle(pool, { schema }) as unknown as PhotosDatabase;
const photos = new DrizzleListingPhotos(db);

const CITY = randomUUID();
const ZONE = randomUUID();
const PUBLISHER = randomUUID();
const WITH_PHOTOS = randomUUID();
const SECOND = randomUUID();
const WITHOUT_PHOTOS = randomUUID();

async function insertListing(id: string): Promise<void> {
  await pool.query(
    `INSERT INTO "listing"
       (id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
        price_usd, rooms, area_m2, bathrooms, contact_method, contact_value, status,
        published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,'Título','x',450,2,78,2,'whatsapp','0412',
             'active',now(),now() + interval '30 days')`,
    [id, PUBLISHER, CITY, ZONE],
  );
}

async function insertPhoto(listingId: string, position: number, names: string[]): Promise<void> {
  const photoId = randomUUID();
  await pool.query(
    `INSERT INTO "listing_photo" (id, listing_id, position, created_at) VALUES ($1,$2,$3,now())`,
    [photoId, listingId, position],
  );
  for (const name of names) {
    await pool.query(
      `INSERT INTO "listing_photo_derivative" (photo_id, name, key, bytes) VALUES ($1,$2,$3,$4)`,
      [photoId, name, `photos/${listingId}/${position}/${name}.webp`, 8_000],
    );
  }
}

beforeAll(async () => {
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2)', [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [ZONE, CITY, `Zona ${ZONE}`],
  );
  await pool.query('INSERT INTO "user" (id, email) VALUES ($1,$2)', [
    PUBLISHER,
    `${PUBLISHER}@rentas.invalid`,
  ]);

  for (const id of [WITH_PHOTOS, SECOND, WITHOUT_PHOTOS]) await insertListing(id);

  // La portada es la 0, y hay otras después para probar que no se cuelan.
  await insertPhoto(WITH_PHOTOS, 0, ["thumb", "card", "strip", "detail", "full"]);
  await insertPhoto(WITH_PHOTOS, 1, ["thumb", "card"]);
  await insertPhoto(WITH_PHOTOS, 2, ["thumb"]);
  await insertPhoto(SECOND, 0, ["card"]);
});

afterAll(async () => {
  await pool.query('DELETE FROM "listing" WHERE publisher_id = $1', [PUBLISHER]);
  await pool.query('DELETE FROM "user" WHERE id = $1', [PUBLISHER]);
  await pool.query('DELETE FROM "city" WHERE id = $1', [CITY]);
  await pool.end();
});

describe("coversFor", () => {
  it("devuelve la foto de posición 0 con todas sus claves", async () => {
    const covers = await photos.coversFor([WITH_PHOTOS]);
    const cover = covers.get(WITH_PHOTOS);

    expect(cover?.position).toBe(0);
    expect(Object.keys(cover?.keys ?? {}).sort()).toEqual([
      "card",
      "detail",
      "full",
      "strip",
      "thumb",
    ]);
  });

  it("nunca devuelve una foto que no es la portada", async () => {
    // Las posiciones 1 y 2 existen para este aviso. Si el adaptador ordenara y
    // cortara mal, devolvería una de ellas y la tarjeta mostraría el baño.
    const cover = (await photos.coversFor([WITH_PHOTOS])).get(WITH_PHOTOS);

    expect(cover?.keys.card).toContain("/0/");
  });

  /**
   * **La razón por la que el puerto es plural.** Una búsqueda devuelve hasta 20
   * avisos, y pedir la portada de a una son 20 viajes contra Neon, que es HTTP.
   */
  it("resuelve varios avisos en una sola llamada", async () => {
    const covers = await photos.coversFor([WITH_PHOTOS, SECOND, WITHOUT_PHOTOS]);

    expect(covers.size).toBe(2);
    expect(covers.get(SECOND)?.keys.card).toBeDefined();
  });

  /**
   * **Un aviso sin fotos no está en el mapa, y no es un error.** La importación
   * de cartera puede producir uno, y la F9 dice que ese aviso no se muestra en
   * la cuadrícula — decidirlo es del llamador.
   */
  it("omite el aviso sin fotos en vez de fallar", async () => {
    const covers = await photos.coversFor([WITHOUT_PHOTOS]);

    expect(covers.has(WITHOUT_PHOTOS)).toBe(false);
  });

  it("no consulta cuando no le dan ids", async () => {
    expect((await photos.coversFor([])).size).toBe(0);
  });
});

describe("allFor", () => {
  it("devuelve todas las fotos en el orden que eligió quien publica", async () => {
    const all = await photos.allFor(WITH_PHOTOS);

    expect(all.map((photo) => photo.position)).toEqual([0, 1, 2]);
  });

  it("agrupa las derivadas de cada foto sin mezclarlas entre fotos", async () => {
    // La 0 tiene las cinco, la 1 dos y la 2 una. Un agrupado por id equivocado
    // le pondría a una foto las claves de otra, y el visor mostraría la
    // fotografía de al lado.
    const all = await photos.allFor(WITH_PHOTOS);

    expect(Object.keys(all[0]?.keys ?? {})).toHaveLength(5);
    expect(Object.keys(all[1]?.keys ?? {})).toHaveLength(2);
    expect(Object.keys(all[2]?.keys ?? {})).toHaveLength(1);
    expect(all[1]?.keys.card).toContain("/1/");
  });

  it("devuelve vacío para un aviso sin fotos", async () => {
    expect(await photos.allFor(WITHOUT_PHOTOS)).toEqual([]);
  });
});
