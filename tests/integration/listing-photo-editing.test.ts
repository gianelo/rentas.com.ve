import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../src/modules/identity/application/ports/session.port";
import { EditListingNotFoundError } from "../../src/modules/listing-publication/application/edit-listing";
import {
  attachPhotoToListing,
  detachPhotoFromListing,
  ListingPhotoRemovalRefusedError,
} from "../../src/modules/listing-publication/application/edit-listing-photos";
import type { PhotoDerivationPort } from "../../src/modules/listing-publication/application/ports/photo-derivation.port";
import type { PhotoHashComputationPort } from "../../src/modules/listing-publication/application/ports/photo-hash-computation.port";
import type {
  PhotoStoragePort,
  StoredObject,
  UploadTarget,
} from "../../src/modules/listing-publication/application/ports/photo-storage.port";
import {
  DrizzleListingActivation,
  DrizzleListingEdit,
  DrizzleListingPhotoSet,
  type PublicationDatabase,
} from "../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import type { PhotoHashPort } from "../../src/modules/listing-trust/application/ports/photo-hash.port";
import { toPerceptualHash } from "../../src/modules/listing-trust/domain/perceptual-hash";
import * as schema from "../../src/shared/db/schema";

/**
 * tasks.md 18.21 — agregar y quitar fotos de un aviso publicado, contra
 * Postgres de verdad.
 *
 * **Tres garantías que ningún doble puede dar:**
 *
 * 1. **que un desprender seguido de un adjuntar no choca.**
 *    `listing_photo_position_unique` es sobre `(listing_id, position)` y el
 *    adjuntar escribe `position = cuántas fotos hay`. Quitar la del medio de
 *    tres dejaría `{0, 2}` con dos filas y el siguiente adjuntar pediría la 2.
 *    Un doble no tiene índice único, así que no puede ver el choque;
 *    2. **que «quitar la portada asciende a la siguiente» es verdad EN LA
 *    BASE** y no sólo en el arreglo que `planPhotoRemoval` devolvió;
 *    3. **que el aviso de otra cuenta no se toca**, con la fila de esa otra
 *    cuenta presente en la misma tabla y leída después.
 *
 * El renumerado se prueba sobre el `position` real, nunca sobre el orden en
 * que una consulta sin `ORDER BY` devuelve las filas.
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

const listings = new DrizzleListingEdit(db as unknown as PublicationDatabase);
const attachment = new DrizzleListingActivation(db as unknown as PublicationDatabase);
const photoSet = new DrizzleListingPhotoSet(db as unknown as PublicationDatabase);

const CITY = randomUUID();
const ZONE = randomUUID();

const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

function sessionFor(userId: string): SessionPort {
  const session: AuthenticatedSession = { userId, email: null, name: null };
  return { getSession: async () => session };
}

const USER_IDS: string[] = [];

async function insertUser(): Promise<string> {
  const id = randomUUID();
  USER_IDS.push(id);
  await pool.query(
    `INSERT INTO "user" (id, name, email, contact_method, contact_value)
     VALUES ($1,$2,$3,'whatsapp','04121234567')`,
    [id, "Dueño", `duenio-${id}@example.com`],
  );
  return id;
}

/** Un aviso ACTIVO con `photos` fotos en las posiciones 0..n-1. */
async function insertActiveListing(
  publisherId: string,
  photos: number,
): Promise<{ readonly listingId: string; readonly photoIds: readonly string[] }> {
  const listingId = randomUUID();
  await pool.query(
    `INSERT INTO "listing" (
       id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
       price_usd, rooms, area_m2, bathrooms, parking_spots, status,
       contact_method, contact_value, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,$5,$6,610,3,128,2,1,'active','whatsapp',
       '04121234567', now(), now() + interval '30 days')`,
    [
      listingId,
      publisherId,
      CITY,
      ZONE,
      "Apartamento amoblado en La Castellana",
      VALID_DESCRIPTION,
    ],
  );

  const photoIds: string[] = [];
  for (let position = 0; position < photos; position++) {
    const photoId = randomUUID();
    photoIds.push(photoId);
    await pool.query(
      `INSERT INTO "listing_photo" (id, listing_id, position, created_at) VALUES ($1,$2,$3, now())`,
      [photoId, listingId, position],
    );
  }
  return { listingId, photoIds };
}

async function positionsOf(
  listingId: string,
): Promise<readonly { id: string; position: number }[]> {
  const { rows } = await pool.query(
    `SELECT id, position FROM "listing_photo" WHERE listing_id = $1 ORDER BY position`,
    [listingId],
  );
  return rows as { id: string; position: number }[];
}

/** Un encabezado PNG de verdad: el guarda de bytes lee los bytes. */
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

/**
 * El rechazo por duplicado entre cuentas ya está probado de punta a punta en
 * `photo-duplicate-rejection.test.ts`; acá el hash queda doble para que dos
 * avisos de este archivo no se acusen entre sí.
 */
const fakeComputeHash: PhotoHashComputationPort = async () =>
  toPerceptualHash(BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000)));

function noMatchPhotoHashes(): PhotoHashPort {
  return {
    async findMatchesFromOtherPublishers() {
      return [];
    },
    async record() {},
  };
}

function attachDependencies(userId: string) {
  return {
    sessionPort: sessionFor(userId),
    listings,
    photos: attachment,
    storage: fakeStorage(),
    derive: fakeDerive,
    computeHash: fakeComputeHash,
    photoHashes: noMatchPhotoHashes(),
    now: () => new Date("2026-03-01T00:00:00.000Z"),
  };
}

/**
 * Las cinco derivadas de una foto, con una clave distinta cada una: es lo que
 * hace que «devolvió la de la `thumb`» sea una afirmación y no una
 * coincidencia de tener una sola fila.
 */
async function insertDerivatives(photoId: string): Promise<void> {
  for (const name of ["thumb", "card", "strip", "detail", "full"]) {
    await pool.query(
      `INSERT INTO "listing_photo_derivative" (photo_id, name, key, bytes)
       VALUES ($1,$2,$3,1)`,
      [photoId, name, `promoted/${photoId}/${name}.webp`],
    );
  }
}

function detachDependencies(userId: string) {
  return {
    sessionPort: sessionFor(userId),
    listings,
    order: photoSet,
    photos: photoSet,
  };
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
  await pool.query(`DELETE FROM "zone" WHERE id = $1`, [ZONE]);
  await pool.query(`DELETE FROM "city" WHERE id = $1`, [CITY]);
  await pool.end();
});

describe("attachPhotoToListing — contra Postgres de verdad", () => {
  it("el dueño adjunta una foto a su aviso activo, y aterriza en la posición que sigue", async () => {
    const owner = await insertUser();
    const { listingId } = await insertActiveListing(owner, 2);

    const result = await attachPhotoToListing(
      {
        listingId,
        incomingKey: incomingKeyFor(owner),
        declaredContentType: "image/png",
      },
      attachDependencies(owner),
    );

    expect(result.position).toBe(2);
    expect((await positionsOf(listingId)).map((row) => row.position)).toEqual([0, 1, 2]);
  });

  it("el aviso de otra cuenta y uno que no existe se contestan con el mismo error, y ninguna fila se escribe", async () => {
    const owner = await insertUser();
    const stranger = await insertUser();
    const { listingId } = await insertActiveListing(owner, 1);

    const ajeno = await attachPhotoToListing(
      { listingId, incomingKey: incomingKeyFor(stranger), declaredContentType: "image/png" },
      attachDependencies(stranger),
    ).catch((error: unknown) => error);

    const inexistente = await attachPhotoToListing(
      {
        listingId: randomUUID(),
        incomingKey: incomingKeyFor(stranger),
        declaredContentType: "image/png",
      },
      attachDependencies(stranger),
    ).catch((error: unknown) => error);

    expect(ajeno).toBeInstanceOf(EditListingNotFoundError);
    expect(inexistente).toBeInstanceOf(EditListingNotFoundError);
    expect((ajeno as Error).name).toBe((inexistente as Error).name);

    // El aviso del dueño sigue con su única foto: el desconocido no escribió nada.
    expect(await positionsOf(listingId)).toHaveLength(1);
  });
});

describe("detachPhotoFromListing — contra Postgres de verdad", () => {
  it("quitar la del medio renumera, así que el siguiente adjuntar NO choca contra listing_photo_position_unique", async () => {
    const owner = await insertUser();
    const { listingId, photoIds } = await insertActiveListing(owner, 3);

    await detachPhotoFromListing(
      { listingId, photoId: photoIds[1] as string },
      detachDependencies(owner),
    );

    // El hueco se cerró: {0, 2} habría hecho que el próximo adjuntar pidiera
    // la 2 y chocara contra el índice único.
    expect(await positionsOf(listingId)).toEqual([
      { id: photoIds[0], position: 0 },
      { id: photoIds[2], position: 1 },
    ]);

    const result = await attachPhotoToListing(
      { listingId, incomingKey: incomingKeyFor(owner), declaredContentType: "image/png" },
      attachDependencies(owner),
    );

    expect(result.position).toBe(2);
    expect((await positionsOf(listingId)).map((row) => row.position)).toEqual([0, 1, 2]);
  });

  it("quitar la portada asciende a la siguiente EN LA BASE, y es la que el plan nombró", async () => {
    const owner = await insertUser();
    const { listingId, photoIds } = await insertActiveListing(owner, 3);

    const result = await detachPhotoFromListing(
      { listingId, photoId: photoIds[0] as string },
      detachDependencies(owner),
    );

    expect(result.coverChangedTo).toBe(photoIds[1]);
    expect(await positionsOf(listingId)).toEqual([
      { id: photoIds[1], position: 0 },
      { id: photoIds[2], position: 1 },
    ]);
  });

  it("quitar la que no es portada no mueve la portada, y las de más abajo suben una", async () => {
    const owner = await insertUser();
    const { listingId, photoIds } = await insertActiveListing(owner, 3);

    const result = await detachPhotoFromListing(
      { listingId, photoId: photoIds[2] as string },
      detachDependencies(owner),
    );

    expect(result.coverChangedTo).toBeNull();
    expect(await positionsOf(listingId)).toEqual([
      { id: photoIds[0], position: 0 },
      { id: photoIds[1], position: 1 },
    ]);
  });

  it("quitar la única foto se rechaza, y la fila sigue ahí", async () => {
    const owner = await insertUser();
    const { listingId, photoIds } = await insertActiveListing(owner, 1);

    await expect(
      detachPhotoFromListing(
        { listingId, photoId: photoIds[0] as string },
        detachDependencies(owner),
      ),
    ).rejects.toBeInstanceOf(ListingPhotoRemovalRefusedError);

    expect(await positionsOf(listingId)).toHaveLength(1);
  });

  it("una foto de OTRO aviso del mismo dueño no se puede quitar por este aviso, y sigue en el suyo", async () => {
    const owner = await insertUser();
    const propio = await insertActiveListing(owner, 2);
    const otro = await insertActiveListing(owner, 2);

    await expect(
      detachPhotoFromListing(
        { listingId: propio.listingId, photoId: otro.photoIds[0] as string },
        detachDependencies(owner),
      ),
    ).rejects.toMatchObject({ refusal: "notFound" });

    expect(await positionsOf(propio.listingId)).toHaveLength(2);
    expect(await positionsOf(otro.listingId)).toHaveLength(2);
  });

  it("el aviso de otra cuenta no desprende nada, y se contesta como uno que no existe", async () => {
    const owner = await insertUser();
    const stranger = await insertUser();
    const { listingId, photoIds } = await insertActiveListing(owner, 2);

    await expect(
      detachPhotoFromListing(
        { listingId, photoId: photoIds[0] as string },
        detachDependencies(stranger),
      ),
    ).rejects.toBeInstanceOf(EditListingNotFoundError);

    expect(await positionsOf(listingId)).toHaveLength(2);
  });

  it("un aviso vencido no desprende fotos: editar no puede ser el camino por el que algo apagado se toca", async () => {
    const owner = await insertUser();
    const { listingId, photoIds } = await insertActiveListing(owner, 2);
    await pool.query(`UPDATE "listing" SET status = 'expired' WHERE id = $1`, [listingId]);

    await expect(
      detachPhotoFromListing(
        { listingId, photoId: photoIds[0] as string },
        detachDependencies(owner),
      ),
    ).rejects.toBeInstanceOf(EditListingNotFoundError);

    expect(await positionsOf(listingId)).toHaveLength(2);
  });
});

/**
 * tasks.md 18.26 — **la lectura que une la foto con su miniatura**, contra
 * Postgres de verdad.
 *
 * **Dos garantías que ningún doble puede dar**: que de las cinco derivadas
 * vuelva la de la `thumb` —un doble devuelve lo que se le dice—, y que una
 * foto sin ninguna derivada **siga apareciendo**, que es lo que un `INNER
 * JOIN` rompería en silencio. Esa segunda es la que importa: el renglón es el
 * único camino para quitar una foto, así que perderlo dejaría una fila que el
 * aviso muestra y su dueño no puede sacar.
 */
describe("listPhotoThumbnailsInOrder — contra Postgres de verdad", () => {
  it("devuelve la clave de la thumb de cada foto, y no la de ningún otro tamaño", async () => {
    const owner = await insertUser();
    const { listingId, photoIds } = await insertActiveListing(owner, 3);
    for (const photoId of photoIds) await insertDerivatives(photoId);

    const fotos = await photoSet.listPhotoThumbnailsInOrder(listingId);

    expect(fotos).toEqual(
      photoIds.map((photoId) => ({
        photoId,
        thumbKey: `promoted/${photoId}/thumb.webp`,
      })),
    );
  });

  /**
   * El orden es el de `position`, no el que la tabla devuelva. Se prueba
   * después de desprender la portada, que es cuando `position` deja de
   * coincidir con el orden de inserción de las filas.
   */
  it("sigue el orden del aviso, también después de que quitar renumeró", async () => {
    const owner = await insertUser();
    const { listingId, photoIds } = await insertActiveListing(owner, 3);
    for (const photoId of photoIds) await insertDerivatives(photoId);

    await detachPhotoFromListing(
      { listingId, photoId: photoIds[0] as string },
      detachDependencies(owner),
    );

    const fotos = await photoSet.listPhotoThumbnailsInOrder(listingId);

    expect(fotos.map((foto) => foto.photoId)).toEqual([photoIds[1], photoIds[2]]);
  });

  it("una foto sin derivadas sigue en la lista, con la miniatura en null", async () => {
    const owner = await insertUser();
    const { listingId, photoIds } = await insertActiveListing(owner, 2);
    // Sólo la SEGUNDA tiene derivadas: si la lectura las exigiera, la primera
    // desaparecería y su dueño se quedaría sin el único botón que la quita.
    await insertDerivatives(photoIds[1] as string);

    const fotos = await photoSet.listPhotoThumbnailsInOrder(listingId);

    expect(fotos).toEqual([
      { photoId: photoIds[0], thumbKey: null },
      { photoId: photoIds[1], thumbKey: `promoted/${photoIds[1]}/thumb.webp` },
    ]);
  });
});
