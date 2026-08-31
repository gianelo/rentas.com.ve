import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type DetailDatabase,
  DrizzleListingDetail,
} from "../../src/modules/listing-discovery/infrastructure/drizzle-listing-detail";
import type { NewListing } from "../../src/modules/listing-publication/application/ports/listing-repository.port";
import {
  DrizzleListingRepository,
  type PublicationDatabase,
} from "../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import {
  DrizzleListingSearch,
  type SearchDatabase,
} from "../../src/modules/listing-search/infrastructure/drizzle-listing-search";
import * as schema from "../../src/shared/db/schema";

/**
 * tasks.md 18.7 — **la seña del paso 2 contra Postgres real.**
 *
 * ## Por qué esto no puede ser un doble
 *
 * Lo que hay que probar acá es que la columna EXISTE y que un valor la
 * atraviesa entero: un repositorio en memoria devuelve lo que se le guardó
 * porque está escrito para devolverlo, y habría pasado igual el día anterior a
 * la migración. La misma razón que `publish-listing.test.ts` (integración) da
 * para la atomicidad.
 *
 * ## Y la mitad más importante es la negativa
 *
 * «Nunca se filtra, nunca se indexa» es la garantía por la que se rechazó
 * Google Places: cuatro cosas ya construidas dependen de que la zona sea una
 * lista cerrada —el filtro, los conteos por zona, la URL
 * `/alquiler/<ciudad>/<zona>/…` y las páginas de zona—, y un campo de texto
 * libre que se filtrara reintroduce exactamente lo que se evitó.
 *
 * Se prueba sobre SQL real y no sobre un tipo: los dos avisos de acá se
 * diferencian ÚNICAMENTE en la seña, y la búsqueda tiene que devolver los dos
 * con todos los filtros que el producto sabe pedir puestos a la vez. Si mañana
 * alguien agrega un predicado sobre esta columna, uno de los dos desaparece.
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
const details = new DrizzleListingDetail(db as unknown as DetailDatabase);
const search = new DrizzleListingSearch(db as unknown as SearchDatabase);

const CITY = randomUUID();
const ZONE = randomUUID();
const PUBLISHER = randomUUID();

/**
 * Acentos y un emoji: la columna es `text` y el valor viaja por una cookie en
 * base64url antes de llegar. Una seña con «ó» que vuelve rota es un defecto que
 * sólo se ve con caracteres reales, y en este país se escriben todos los días.
 */
const SEÑA = "Al lado de la panadería, edificio azul 🏠";

const PUBLISHED_AT = new Date("2026-08-17T15:00:00.000Z");

function listing(overrides: Partial<NewListing> = {}): NewListing {
  return {
    publisherId: PUBLISHER,
    publisherType: "owner",
    propertyType: "apartamento",
    cityId: CITY,
    zoneId: ZONE,
    title: "Apartamento 2 habitaciones con puesto",
    description: "d".repeat(140),
    priceUsd: 520,
    rooms: 2,
    areaM2: 78,
    bathrooms: 2,
    parkingSpots: 1,
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: true,
    hasSecurity: true,
    hasAppliances: true,
    contactMethod: "whatsapp",
    contactValue: "04121234567",
    status: "active",
    publishedAt: PUBLISHED_AT,
    expiresAt: new Date(PUBLISHED_AT.getTime() + 30 * 86_400_000),
    photos: [],
    ...overrides,
  };
}

let conSeña = "";
let sinSeña = "";

beforeAll(async () => {
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2)', [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'elemento','IPOSTEL')`,
    [ZONE, CITY, `Zona ${ZONE}`],
  );
  await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1,$2,$3)', [
    PUBLISHER,
    "María F.",
    `${PUBLISHER}@rentas.invalid`,
  ]);

  // Dos filas idénticas salvo la seña. Es lo que hace que cualquier consulta
  // que las distinga sólo pueda haberlas distinguido por ella.
  conSeña = (await repository.save(listing({ reference: SEÑA }))).id;
  sinSeña = (await repository.save(listing())).id;
});

afterAll(async () => {
  await pool.query('DELETE FROM "listing" WHERE publisher_id = $1', [PUBLISHER]);
  await pool.query('DELETE FROM "user" WHERE id = $1', [PUBLISHER]);
  await pool.query('DELETE FROM "zone" WHERE id = $1', [ZONE]);
  await pool.query('DELETE FROM "city" WHERE id = $1', [CITY]);
  await pool.end();
});

describe("la seña se guarda con el aviso (18.7)", () => {
  it("la columna existe y el valor vuelve entero, con acentos y todo", async () => {
    const { rows } = await pool.query('SELECT reference FROM "listing" WHERE id = $1', [conSeña]);

    expect(rows[0]?.reference).toBe(SEÑA);
  });

  /**
   * **El par, y existe porque una sola afirmación aceptaría las dos
   * respuestas.** La columna es nulable y ése es su estado final: «sin seña» es
   * un hecho verdadero de casi todos los avisos, y guardar `''` haría que la
   * ficha dibujara un párrafo vacío debajo de la ubicación.
   */
  it("un aviso sin seña guarda NULL, no una cadena vacía", async () => {
    const { rows } = await pool.query('SELECT reference FROM "listing" WHERE id = $1', [sinSeña]);

    expect(rows[0]?.reference).toBeNull();
  });

  it("la ficha la lee, y la del aviso que no tiene llega como null", async () => {
    expect((await details.findForDetail(conSeña))?.reference).toBe(SEÑA);
    expect((await details.findForDetail(sinSeña))?.reference).toBeNull();
  });
});

describe("ninguna búsqueda puede filtrar ni transportar la seña (18.7)", () => {
  /**
   * Todos los filtros que el producto sabe pedir, a la vez, sobre dos avisos
   * que sólo se diferencian en la seña. Los dos tienen que volver: la búsqueda
   * no tiene por dónde recibirla —no está en `SearchCriteria`— y el `WHERE` no
   * la nombra.
   */
  it("con todos los filtros puestos, los dos avisos vuelven igual", async () => {
    const results = await search.search({
      cityId: CITY,
      zoneIds: [ZONE],
      minPriceUsd: 100,
      maxPriceUsd: 1_000,
      minRooms: 2,
      minAreaM2: 50,
      propertyType: "apartamento",
      publisherType: "owner",
      attributes: [
        "hasPowerPlant",
        "hasRegularWater",
        "isFurnished",
        "hasSecurity",
        "hasAppliances",
      ],
    });

    expect(results.map((row) => row.id).sort()).toEqual([conSeña, sinSeña].sort());
  });

  /**
   * Y no viaja en el resultado. **El `select` de la búsqueda es la otra mitad
   * de «nunca se indexa»**: una tarjeta que la cargara la publicaría en la
   * lista, en las sugerencias de la ficha y en la portada, o sea en tres
   * páginas que un rastreador sí lee.
   */
  it("ningún resultado transporta la seña, ni siquiera escondida en una propiedad", async () => {
    const results = await search.search({ cityId: CITY });

    expect(results).toHaveLength(2);
    expect(JSON.stringify(results)).not.toContain("panadería");
  });
});
