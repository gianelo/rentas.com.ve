import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { confirmImport } from "../../src/modules/broker-bulk-import/application/confirm-import";
import type { ImportFileSourcePort } from "../../src/modules/broker-bulk-import/application/ports/import-file-source.port";
import { validateImport } from "../../src/modules/broker-bulk-import/application/validate-import";
import { DrizzleBulkImportAccounts } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import { DrizzleImportAccountContact } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-import-account-contact";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../src/modules/identity/application/ports/session.port";
import {
  type CatalogueDatabase,
  DrizzleCatalogue,
} from "../../src/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { activateListing } from "../../src/modules/listing-publication/application/activate-listing";
import { attachPhotoToDraft } from "../../src/modules/listing-publication/application/attach-photo-to-draft";
import { listPublisherListings } from "../../src/modules/listing-publication/application/list-publisher-listings";
import type { PhotoDerivationPort } from "../../src/modules/listing-publication/application/ports/photo-derivation.port";
import type { PhotoHashComputationPort } from "../../src/modules/listing-publication/application/ports/photo-hash-computation.port";
import type {
  PhotoStoragePort,
  StoredObject,
  UploadTarget,
} from "../../src/modules/listing-publication/application/ports/photo-storage.port";
import { requestDraftPhotoUpload } from "../../src/modules/listing-publication/application/request-draft-photo-upload";
import {
  DrizzleListingActivation,
  DrizzleListingRepository,
  DrizzleZoneCatalogue,
  type PublicationDatabase,
} from "../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { DrizzlePublisherListings } from "../../src/modules/listing-publication/infrastructure/drizzle-publisher-listings";
import {
  DrizzleListingSearch,
  type SearchDatabase,
} from "../../src/modules/listing-search/infrastructure/drizzle-listing-search";
import type { PhotoHashPort } from "../../src/modules/listing-trust/application/ports/photo-hash.port";
import { toPerceptualHash } from "../../src/modules/listing-trust/domain/perceptual-hash";
import * as schema from "../../src/shared/db/schema";

/**
 * **tasks.md 9.27 — la cadena entera, contra Postgres real.**
 *
 * `inmobiliaria habilitada importa → le pone fotos → los borradores se
 * activan → aparecen en la búsqueda por ciudad`.
 *
 * Cada eslabón ya estaba probado **solo**: `confirm-import.test.ts` y
 * `broker-bulk-import-confirm.test.ts` prueban la importación,
 * `listing-photo-attachment.test.ts` la foto, `listing-activation.test.ts` la
 * activación, `listing-search.test.ts` la búsqueda. Lo que no estaba probado
 * eran **las juntas**, que es exactamente la clase de fallo que este
 * repositorio ya pagó: el PR #103 existe porque dos ramas pasaron cada una
 * sus propios gates y ninguna probó el encuentro.
 *
 * **Corre en cada `push`** (`pnpm test:integration` contra el Postgres
 * dockerizado), no contra un despliegue: es la mitad determinista de la
 * 9.27. La mitad de navegador —que la puerta exista y refuse a un anónimo—
 * vive en `tests/e2e/import-access.spec.ts`.
 *
 * **La cadena se recorre por los casos de uso reales**, no por SQL: si
 * `confirmImport` dejara de escribir `status = 'draft'`, o `activateListing`
 * dejara de recalcular `expires_at`, o el `WHERE status = 'active'` de la
 * búsqueda se aflojara, esta prueba lo ve. Un `INSERT` a mano probaría la
 * base, no el producto.
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
const catalogue = new DrizzleCatalogue(db as unknown as CatalogueDatabase);
const search = new DrizzleListingSearch(db as unknown as SearchDatabase);
const publisherListings = new DrizzlePublisherListings(db as unknown as PublicationDatabase);

const USER_IDS: string[] = [];
const CITY_IDS: string[] = [];

let counter = 0;

async function makeCityAndZone(): Promise<{ cityId: string; zoneId: string }> {
  counter += 1;
  const cityId = `city-chain-${counter}`;
  const zoneId = `zone-chain-${counter}`;
  await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [cityId, `Ciudad ${cityId}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [zoneId, cityId, `Zona ${zoneId}`],
  );
  CITY_IDS.push(cityId);
  return { cityId, zoneId };
}

async function insertBroker(bulkImportEnabled: boolean): Promise<string> {
  counter += 1;
  const id = `broker-chain-${counter}`;
  USER_IDS.push(id);
  await pool.query(
    `INSERT INTO "user" (id, name, email, bulk_import_enabled, contact_method, contact_value)
     VALUES ($1,$2,$3,$4,'whatsapp','04121234567')`,
    [id, "Inmobiliaria", `${id}@example.com`, bulkImportEnabled],
  );
  return id;
}

const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

const HEADER =
  "referencia_externa,titulo,descripcion,precio_usd,ciudad,zona,tipo_inmueble,habitaciones,banos,metros2";

/** Nombres, no ids — el resolvedor de `ciudad`/`zona` por nombre (9.25b). */
function rowLine(reference: string, cityId: string, zoneId: string, priceUsd = 450): string {
  return `${reference},Titulo del aviso,"${VALID_DESCRIPTION}",${priceUsd},Ciudad ${cityId},Zona ${zoneId},apartamento,2,2,78`;
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

function importDependencies(userId: string) {
  return {
    sessionPort: sessionFor(userId),
    accounts,
    contact,
    zones,
    catalogue,
    listings: listingsRepo,
    now: () => new Date("2026-03-01T00:00:00.000Z"),
  };
}

/** Un PNG real: el guardia de `processUploadedPhoto` lee bytes de verdad. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const TOKEN = "9c1d4e6f8a2b0c3d5e7f9a1b3c5d7e9f";

const fakeStorage: PhotoStoragePort = {
  // tasks.md 9.28: `requestDraftPhotoUpload` sí lo usa ahora. Lo que se prueba
  // contra Postgres es a QUIÉN se le firma, no la firma en sí — eso es de
  // `r2-photo-storage.test.ts`, que no necesita base.
  async createUploadTarget(request): Promise<UploadTarget> {
    return {
      key: `incoming/${request.publisherId}/${TOKEN}`,
      url: "https://r2.example/put",
      expiresAt: new Date("2026-04-10T12:05:00.000Z"),
    };
  },
  async read(): Promise<Uint8Array> {
    return PNG;
  },
  async put(key: string, bytes: Uint8Array): Promise<StoredObject> {
    return { key, byteLength: bytes.byteLength };
  },
  async remove(): Promise<void> {},
};

const fakeDerive: PhotoDerivationPort = async () => ({
  thumb: { bytes: new Uint8Array([1]), byteLength: 1 },
  card: { bytes: new Uint8Array([1]), byteLength: 1 },
  strip: { bytes: new Uint8Array([1]), byteLength: 1 },
  detail: { bytes: new Uint8Array([1]), byteLength: 1 },
  full: { bytes: new Uint8Array([1]), byteLength: 1 },
});

/**
 * La regla D4 se prueba entera en `photo-duplicate-rejection.test.ts`. Acá un
 * hash fijo haría chocar a cada corredor de este archivo con el anterior, que
 * es un fallo del arnés y no del producto.
 */
const fakeComputeHash: PhotoHashComputationPort = async () =>
  toPerceptualHash(BigInt(Date.now()) * 1000n + BigInt(counter));

const noMatchPhotoHashes: PhotoHashPort = {
  async findMatchesFromOtherPublishers() {
    return [];
  },
  async record() {},
};

function photoDependencies(userId: string) {
  return {
    sessionPort: sessionFor(userId),
    listings: activation,
    photos: activation,
    storage: fakeStorage,
    derive: fakeDerive,
    computeHash: fakeComputeHash,
    photoHashes: noMatchPhotoHashes,
  };
}

async function draftIdFor(userId: string, reference: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT id FROM "listing" WHERE publisher_id = $1 AND external_reference = $2`,
    [userId, reference],
  );
  return rows[0].id as string;
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

describe("9.27 — importar, fotografiar, activar, aparecer (contra Postgres real)", () => {
  it("la cadena entera: la que recibe foto y se activa aparece en la búsqueda de SU ciudad; la que no, no", async () => {
    const { cityId, zoneId } = await makeCityAndZone();
    const broker = await insertBroker(true);

    // 1. Importar dos filas.
    const outcome = await confirmImport(
      sourceFromText(
        [
          HEADER,
          rowLine("CADENA-A", cityId, zoneId),
          rowLine("CADENA-B", cityId, zoneId, 610),
        ].join("\n"),
      ),
      importDependencies(broker),
    );
    expect(outcome.createdCount).toBe(2);
    expect(outcome.errors).toEqual([]);

    // 2. Un borrador no se ve: la búsqueda de la ciudad no devuelve NINGUNA.
    expect(await search.search({ cityId })).toEqual([]);

    const conFoto = await draftIdFor(broker, "CADENA-A");
    const sinFoto = await draftIdFor(broker, "CADENA-B");

    // 3. Una foto por el MISMO camino que usa publicar (9.20/9.21).
    const attached = await attachPhotoToDraft(
      {
        listingId: conFoto,
        incomingKey: `incoming/${broker}/${TOKEN}`,
        declaredContentType: "image/png",
      },
      photoDependencies(broker),
    );
    expect(attached.position).toBe(0);

    // 4. Activar. El reloj de 30 días arranca ACÁ, no en la importación.
    const activatedAt = new Date("2026-04-10T12:00:00.000Z");
    const activated = await activateListing(
      { listingId: conFoto },
      {
        sessionPort: sessionFor(broker),
        zones,
        listings: activation,
        now: () => activatedAt,
      },
    );
    expect(activated.publishedAt).toEqual(activatedAt);
    expect(activated.expiresAt.getTime()).toBeGreaterThan(activatedAt.getTime());

    // 5. La junta que nadie probaba: aparece en la búsqueda de su ciudad, y
    //    aparece SOLA — la hermana sin foto sigue siendo borrador.
    const results = await search.search({ cityId });
    expect(results.map((row) => row.id)).toEqual([conFoto]);
    expect(results[0]?.cityId).toBe(cityId);
    expect(results[0]?.publisherType).toBe("broker");
    expect(results.map((row) => row.id)).not.toContain(sinFoto);
  });

  /**
   * **El aislamiento por ciudad, sobre un aviso que llegó importado.**
   * `listing-search.test.ts` ya lo prueba con filas insertadas a mano; lo que
   * esta prueba agrega es que la ciudad que `resolve-import-locations.ts`
   * dedujo de un NOMBRE escrito en un CSV es la misma por la que la búsqueda
   * después filtra. Entre esos dos pasos hay una traducción nombre→id, y una
   * traducción es exactamente donde una junta se rompe en silencio.
   */
  it("un aviso importado y activado NO se filtra en la búsqueda de otra ciudad", async () => {
    const suya = await makeCityAndZone();
    const ajena = await makeCityAndZone();
    const broker = await insertBroker(true);

    await confirmImport(
      sourceFromText([HEADER, rowLine("CADENA-C", suya.cityId, suya.zoneId)].join("\n")),
      importDependencies(broker),
    );
    const listingId = await draftIdFor(broker, "CADENA-C");

    await attachPhotoToDraft(
      {
        listingId,
        incomingKey: `incoming/${broker}/${TOKEN}`,
        declaredContentType: "image/png",
      },
      photoDependencies(broker),
    );
    await activateListing(
      { listingId },
      { sessionPort: sessionFor(broker), zones, listings: activation },
    );

    expect((await search.search({ cityId: suya.cityId })).map((row) => row.id)).toEqual([
      listingId,
    ]);
    expect(await search.search({ cityId: ajena.cityId })).toEqual([]);
  });

  /**
   * **La activación es la que cierra el hueco que la importación abre a
   * propósito.** Un borrador se escribe con cero fotos (`stage: "draft"`), y
   * `validatePublishableListing("activation")` es lo único que exige la foto.
   * Sin esta prueba, aflojar esa etapa dejaría entrar a la búsqueda un aviso
   * sin una sola imagen — y la lámina 14d dice, textualmente, "un aviso sin
   * fotos no se puede activar y nadie lo ve".
   */
  it("un borrador importado SIN foto no se puede activar, y sigue sin aparecer", async () => {
    const { cityId, zoneId } = await makeCityAndZone();
    const broker = await insertBroker(true);

    await confirmImport(
      sourceFromText([HEADER, rowLine("CADENA-D", cityId, zoneId)].join("\n")),
      importDependencies(broker),
    );
    const listingId = await draftIdFor(broker, "CADENA-D");

    await expect(
      activateListing(
        { listingId },
        { sessionPort: sessionFor(broker), zones, listings: activation },
      ),
    ).rejects.toThrow(/photos\.required/);

    expect(await search.search({ cityId })).toEqual([]);
  });

  /**
   * **tasks.md 9.28 — los dos eslabones del medio, recorridos por donde el
   * corredor los recorre.**
   *
   * Hasta esta porción la cadena existía pero era intransitable: `/mis-avisos`
   * era una carcasa y `attachPhotoToDraft`/`activateListing` no los llamaba
   * ninguna ruta. Esta prueba recorre la cadena entera por los MISMOS casos de
   * uso que la pantalla llama —listar el tablero, pedir el destino de la foto,
   * adjuntarla, activar— y vuelve a mirar el tablero. Si la lista de «Mis
   * avisos» dejara de traer los borradores importados, o dejara de contar sus
   * fotos, o el aviso activado siguiera dibujándose como borrador, se ve acá.
   */
  it("la cadena por la pantalla: el borrador importado sale en «Mis avisos», recibe foto, se activa y cambia de estado ahí mismo", async () => {
    const { cityId, zoneId } = await makeCityAndZone();
    const broker = await insertBroker(true);

    await confirmImport(
      sourceFromText([HEADER, rowLine("TABLERO-A", cityId, zoneId)].join("\n")),
      importDependencies(broker),
    );
    const listingId = await draftIdFor(broker, "TABLERO-A");

    // 1. El tablero LO VE, como borrador y sin fotos. Es lo que convertía
    //    «se crearon 38 y ninguna se ve» en un callejón sin salida.
    const antes = await listPublisherListings(
      {},
      { sessionPort: sessionFor(broker), listings: publisherListings },
    );
    expect(antes.cards.map((card) => card.id)).toEqual([listingId]);
    expect(antes.cards[0]?.state).toBe("draft");
    expect(antes.cards[0]?.photoCount).toBe(0);
    expect(antes.draftsAwaitingPhotos).toBe(1);
    expect(antes.cards[0]?.zoneName).toBe(`Zona ${zoneId}`);
    expect(antes.cards[0]?.externalReference).toBe("TABLERO-A");

    // 2. La firma que la pantalla pide antes de subir, contra la fila real.
    const destino = await requestDraftPhotoUpload(
      { listingId, contentType: "image/webp", byteLength: 38_000 },
      { sessionPort: sessionFor(broker), listings: activation, storage: fakeStorage },
    );
    expect(destino.key).toBe(`incoming/${broker}/${TOKEN}`);

    // 3. Adjuntar y activar, por los dos casos de uso que ninguna ruta
    //    llamaba hasta ahora.
    await attachPhotoToDraft(
      { listingId, incomingKey: destino.key, declaredContentType: "image/png" },
      photoDependencies(broker),
    );
    await activateListing(
      { listingId },
      { sessionPort: sessionFor(broker), zones, listings: activation },
    );

    // 4. El mismo tablero, después: activa, con su foto contada, y ya no
    //    esperando nada.
    const despues = await listPublisherListings(
      {},
      { sessionPort: sessionFor(broker), listings: publisherListings },
    );
    expect(despues.cards[0]?.state).toBe("active");
    expect(despues.cards[0]?.photoCount).toBe(1);
    expect(despues.draftsAwaitingPhotos).toBe(0);
    expect(despues.publishedCount).toBe(1);

    // 5. Y la búsqueda, que es el final de la cadena de la 9.27.
    expect((await search.search({ cityId })).map((row) => row.id)).toEqual([listingId]);
  });

  /**
   * **«Mis avisos» son los MÍOS, contra el `WHERE` real.** El caso de uso ya
   * lo prueba con dobles; lo que un doble no puede probar es que la consulta
   * lleva el `publisher_id` adentro en vez de filtrar después — la misma
   * lección que `listing-photo-attachment.test.ts` documenta para su propia
   * cláusula.
   */
  it("el tablero de una inmobiliaria nunca trae los borradores de otra", async () => {
    const { cityId, zoneId } = await makeCityAndZone();
    const brokerA = await insertBroker(true);
    const brokerB = await insertBroker(true);

    await confirmImport(
      sourceFromText([HEADER, rowLine("TABLERO-B", cityId, zoneId)].join("\n")),
      importDependencies(brokerA),
    );
    const deA = await draftIdFor(brokerA, "TABLERO-B");

    const tableroDeB = await listPublisherListings(
      {},
      { sessionPort: sessionFor(brokerB), listings: publisherListings },
    );

    expect(tableroDeB.total).toBe(0);
    expect(tableroDeB.cards.map((card) => card.id)).not.toContain(deA);

    // Y B tampoco puede obtener permiso de escritura para el borrador de A.
    await expect(
      requestDraftPhotoUpload(
        { listingId: deA, contentType: "image/webp", byteLength: 1000 },
        { sessionPort: sessionFor(brokerB), listings: activation, storage: fakeStorage },
      ),
    ).rejects.toThrow(/does not belong to the caller/);
  });

  /**
   * **La puerta, contra la base real.** `authorize-bulk-import.test.ts` ya
   * prueba la decisión con un doble; acá la bandera es una columna de verdad
   * en una fila de verdad, leída por el adaptador de verdad — y no se crea
   * ningún borrador.
   */
  it("una cuenta sin la bandera no importa nada, ni siquiera para previsualizar", async () => {
    const { cityId, zoneId } = await makeCityAndZone();
    const broker = await insertBroker(false);
    const file = sourceFromText([HEADER, rowLine("CADENA-E", cityId, zoneId)].join("\n"));

    await expect(validateImport(file, importDependencies(broker))).rejects.toThrow(
      /does not have bulk import enabled/,
    );

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "listing" WHERE publisher_id = $1`,
      [broker],
    );
    expect(rows[0].n).toBe(0);
  });
});
