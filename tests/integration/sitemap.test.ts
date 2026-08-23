import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIN_INDEXABLE_DESCRIPTION_LENGTH } from "../../src/modules/listing-discovery/domain/listing-structured-data";
import { buildSitemap } from "../../src/modules/listing-discovery/domain/sitemap";
import {
  DrizzleSitemap,
  type SitemapDatabase,
} from "../../src/modules/listing-discovery/infrastructure/drizzle-sitemap";
import * as schema from "../../src/shared/db/schema";

/**
 * `DrizzleSitemap` contra Postgres real.
 *
 * Lo que sólo la base puede contestar es la **doble condición de vigencia**:
 * un aviso cuya fila todavía dice `active` pero cuyo `expires_at` ya pasó. Esa
 * es la ventana que abre el cron cuando se atrasa, y un fake que filtra por
 * `status` porque lo escribieron así nunca la vería.
 *
 * Y la tercera condición (11.15): que el SQL mida el contenido igual que
 * `resolveListingIndexing`, blancos colapsados incluidos. El número vive en el
 * dominio; que las dos escrituras del mismo predicado no se separen lo sostiene
 * este archivo.
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
const db = drizzle(pool, { schema }) as unknown as SitemapDatabase;
const sitemap = new DrizzleSitemap(db);

const CITY = randomUUID();
const ZONE = randomUUID();
const OTHER_ZONE = randomUUID();
const PUBLISHER = randomUUID();
const ACTIVE = randomUUID();
const OLDER = randomUUID();
const EXPIRED_STATUS = randomUUID();
const HIDDEN = randomUUID();
const LAPSED = randomUUID();
const THIN = randomUUID();
const PADDED = randomUUID();
const THIN_ZONE = randomUUID();

const CITY_NAME = `Ciudad ${CITY}`;
const ZONE_NAME = `Zona ${ZONE}`;

/** Una descripción que pasa el umbral de contenido, para no ser el sujeto. */
const LONG_DESCRIPTION =
  "Apartamento luminoso en un edificio de cuatro pisos, con balcón hacia el " +
  "patio interno y cocina independiente. El condominio incluye el agua y la " +
  "vigilancia nocturna. Queda a dos cuadras del mercado y a una parada del " +
  "corredor vial, y el estacionamiento es techado. Se alquila desde el primero " +
  "del mes que viene, con contrato de un año.";

async function insertListing(
  id: string,
  zoneId: string,
  status: string,
  publishedInterval: string,
  expiresInterval: string,
  description: string = LONG_DESCRIPTION,
): Promise<void> {
  await pool.query(
    `INSERT INTO "listing"
       (id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
        price_usd, rooms, area_m2, bathrooms, parking_spots,
        has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
        contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,'Apartamento 2 habitaciones',$8,
             450,2,78,1,0, false,false,false,false,false,
             'email','sin-contacto',$5, now() - $6::interval, now() + $7::interval)`,
    [id, PUBLISHER, CITY, zoneId, status, publishedInterval, expiresInterval, description],
  );
}

beforeAll(async () => {
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2)', [CITY, CITY_NAME]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [ZONE, CITY, ZONE_NAME],
  );
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [OTHER_ZONE, CITY, `Zona ${OTHER_ZONE}`],
  );
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [THIN_ZONE, CITY, `Zona ${THIN_ZONE}`],
  );
  await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1,$2,$3)', [
    PUBLISHER,
    "María F.",
    `${PUBLISHER}@rentas.invalid`,
  ]);

  await insertListing(ACTIVE, ZONE, "active", "1 day", "29 days");
  await insertListing(OLDER, ZONE, "active", "10 days", "20 days");
  await insertListing(EXPIRED_STATUS, ZONE, "expired", "40 days", "-10 days");
  await insertListing(HIDDEN, ZONE, "hidden", "2 days", "28 days");
  // La ventana del cron atrasado: la fila todavía dice `active` y la fecha ya
  // pasó. `-1 day` como intervalo positivo deja `expires_at` en el pasado.
  await insertListing(LAPSED, OTHER_ZONE, "active", "40 days", "-1 day");
  // Vigente y de dos líneas: la forma que llega por importación masiva, que
  // nunca pasó por el piso de 120 caracteres del formulario de publicar.
  await insertListing(THIN, THIN_ZONE, "active", "3 days", "27 days", "Apartamento. Llamar.");
  // El mismo texto corto, inflado con blancos hasta pasar el umbral en crudo.
  await insertListing(
    PADDED,
    ZONE,
    "active",
    "4 days",
    "26 days",
    `Apartamento.${"\n \t".repeat(MIN_INDEXABLE_DESCRIPTION_LENGTH)}`,
  );
});

afterAll(async () => {
  await pool.query('DELETE FROM "listing" WHERE publisher_id = $1', [PUBLISHER]);
  await pool.query('DELETE FROM "user" WHERE id = $1', [PUBLISHER]);
  await pool.query('DELETE FROM "city" WHERE id = $1', [CITY]);
  await pool.end();
});

describe("activeListings", () => {
  async function idsForThisFixture(): Promise<string[]> {
    const rows = await sitemap.activeListings();
    return rows.filter((row) => row.cityName === CITY_NAME).map((row) => row.id);
  }

  it("trae el aviso activo con el nombre de su ciudad y su zona", async () => {
    const rows = await sitemap.activeListings();
    const row = rows.find((candidate) => candidate.id === ACTIVE);

    expect(row).toMatchObject({ cityName: CITY_NAME, zoneName: ZONE_NAME });
    expect(row?.publishedAt).toBeInstanceOf(Date);
  });

  it("deja fuera el vencido y el oculto", async () => {
    const ids = await idsForThisFixture();

    expect(ids).not.toContain(EXPIRED_STATUS);
    expect(ids).not.toContain(HIDDEN);
  });

  /**
   * **La razón de que la condición sean DOS y no una.** El estado lo mueve un
   * trabajo programado, y un trabajo programado se atrasa. Entre que un aviso
   * vence y que el cron lo marca, su fila sigue diciendo `active` — y el
   * sitemap estaría invitando a Google a una página que ya se dibuja vencida.
   */
  it("deja fuera un aviso que todavía dice active pero cuya fecha ya pasó", async () => {
    const ids = await idsForThisFixture();

    expect(ids).not.toContain(LAPSED);
  });

  /**
   * **La coherencia con la propia ficha** (11.15). Un aviso de contenido
   * delgado se sirve, pero su ficha lleva `noindex`: dejarlo en el sitemap
   * sería pedirle a Google que indexe una página que la propia página le pide
   * no indexar, y eso Search Console lo reporta como un error. Servir no es lo
   * mismo que recomendar.
   */
  it("deja fuera un aviso vigente cuya descripción no llega al umbral", async () => {
    const ids = await idsForThisFixture();

    expect(ids).not.toContain(THIN);
  });

  /** Los blancos no compran una entrada, igual que no compran indexación. */
  it("no cuenta el relleno de espacios como contenido", async () => {
    const ids = await idsForThisFixture();

    expect(ids).not.toContain(PADDED);
  });

  it("devuelve el más reciente primero", async () => {
    const ids = await idsForThisFixture();

    expect(ids.indexOf(ACTIVE)).toBeLessThan(ids.indexOf(OLDER));
  });

  /**
   * La garantía completa, extremo a extremo: la zona del aviso vencido NO
   * aparece en el documento, porque las zonas se derivan de los avisos que
   * este puerto devolvió y no de una consulta aparte.
   */
  it("no publica la página de una zona cuyo único aviso ya venció", async () => {
    const rows = (await sitemap.activeListings()).filter((row) => row.cityName === CITY_NAME);
    const urls = buildSitemap("https://rentas.test", rows).map((entry) => entry.url);

    expect(urls.some((url) => url.includes(`zona-${ZONE}`))).toBe(true);
    expect(urls.some((url) => url.includes(`zona-${OTHER_ZONE}`))).toBe(false);
    // Lo mismo del otro lado de la tercera condición: la zona cuyo único aviso
    // es delgado tampoco se publica, porque las zonas se derivan de estas filas.
    expect(urls.some((url) => url.includes(`zona-${THIN_ZONE}`))).toBe(false);
  });
});
