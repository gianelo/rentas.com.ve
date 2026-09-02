import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRICE_HISTOGRAM_BUCKETS } from "../../src/modules/listing-search/domain/price-histogram";
import {
  DrizzleFacetedSearch,
  type FacetedSearchDatabase,
} from "../../src/modules/listing-search/infrastructure/drizzle-faceted-search";
import { DrizzleZonePriceTally } from "../../src/modules/listing-search/infrastructure/drizzle-zone-price-tally";
import * as schema from "../../src/shared/db/schema";

/**
 * **El puerto angosto del paso 3, contra Postgres real** (tasks.md 18.28).
 *
 * `DrizzleZonePriceTally` no tenía una sola prueba de integración — la 18.9 lo
 * embarcó componiendo `DrizzleFacetedSearch` y su cobertura era cero. Es el
 * único puerto de este módulo sin una, y el hueco importa por dónde está: los
 * ocho cubos son la frase «la mayoría pide entre $X y $Y» que ve quien publica,
 * o sea un número que se dibuja bien estando mal.
 *
 * **La aserción que sostiene la 18.9 es la segunda**, y existe para que un
 * refactor futuro no pueda partir el reparto en dos: el puerto angosto tiene
 * que devolver **exactamente** los mismos ocho cubos que la faceta de la
 * búsqueda para la misma zona. Hoy es trivialmente cierto —el adaptador compone
 * al otro— y por eso mismo cuesta nada dejarla escrita: el día que alguien
 * desprenda el `width_bucket` a una función que los dos llamen (la 18.28), esto
 * es lo que se pone rojo si las dos ramas dejan de coincidir. Sin ella, «un
 * solo `width_bucket`» es una propiedad del código de hoy y no una garantía.
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
const facets = new DrizzleFacetedSearch(db as unknown as FacetedSearchDatabase);
const tally = new DrizzleZonePriceTally(db as unknown as FacetedSearchDatabase);

/** Ciudad y zonas propias: sumarle avisos a otra movería los números de otro archivo. */
const CIUDAD = randomUUID();
const OTRA_CIUDAD = randomUUID();
const ZONA = randomUUID();
const ZONA_VECINA = randomUUID();
const ZONA_DE_LA_OTRA = randomUUID();
const PUBLICADOR = randomUUID();

/**
 * Doce avisos en la zona —el piso del histograma— entre 200 y 900, con **tres
 * de 400 iguales**: el eje mide 87,5 por cubo y quedan [200 220], [300 320],
 * [400 400 400], [500 520], [600], [700], vacío, [900].
 */
const PRECIOS = [200, 220, 300, 320, 400, 400, 400, 500, 520, 600, 700, 900] as const;

/** Los que NO deben entrar, y cada uno por una razón distinta. */
const VECINO_USD = 1500;
const OTRA_CIUDAD_USD = 1600;
const VENCIDO_POR_RELOJ_USD = 1700;

const THIRTY_DAYS_IN_MINUTES = 30 * 24 * 60;

async function insertListing(
  zoneId: string,
  cityId: string,
  priceUsd: number,
  expiresInMinutes = THIRTY_DAYS_IN_MINUTES,
) {
  await pool.query(
    `INSERT INTO "listing" (id, publisher_id, publisher_type, property_type, city_id, zone_id, title,
       description, price_usd, rooms, area_m2, bathrooms, parking_spots,
       contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,'Apartamento','x',$5,2,60,1,1,
       'whatsapp','04121234567','active',now(), now() + make_interval(mins => $6::int))`,
    [randomUUID(), PUBLICADOR, cityId, zoneId, priceUsd, expiresInMinutes],
  );
}

beforeAll(async () => {
  for (const [id, name] of [
    [CIUDAD, "Cubos"],
    [OTRA_CIUDAD, "Cubos vecina"],
  ] as const) {
    await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [id, `${name} ${id}`]);
  }
  for (const [id, city, name] of [
    [ZONA, CIUDAD, "La zona"],
    [ZONA_VECINA, CIUDAD, "La de al lado"],
    [ZONA_DE_LA_OTRA, OTRA_CIUDAD, "La zona"],
  ] as const) {
    await pool.query(
      `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
      [id, city, name],
    );
  }
  await pool.query(`INSERT INTO "user" (id, email) VALUES ($1,$2)`, [
    PUBLICADOR,
    `cubos-${PUBLICADOR}@ej.com`,
  ]);

  for (const priceUsd of PRECIOS) await insertListing(ZONA, CIUDAD, priceUsd);
  await insertListing(ZONA_VECINA, CIUDAD, VECINO_USD);
  await insertListing(ZONA_DE_LA_OTRA, OTRA_CIUDAD, OTRA_CIUDAD_USD);
  // Rótulo `active`, vencimiento pasado: el barrido diario no corrió todavía.
  await insertListing(ZONA, CIUDAD, VENCIDO_POR_RELOJ_USD, -60);
});

afterAll(async () => {
  await pool.query(`DELETE FROM "user" WHERE id = $1`, [PUBLICADOR]);
  await pool.query(`DELETE FROM "city" WHERE id = ANY($1)`, [[CIUDAD, OTRA_CIUDAD]]);
  await pool.end();
});

describe("los ocho cubos de una zona (18.9), contra la base", () => {
  it("reparte los doce avisos en el eje que dibuja el paso 3", async () => {
    const cubos = await tally.tallyForZone(CIUDAD, ZONA);

    expect(cubos).toHaveLength(PRICE_HISTOGRAM_BUCKETS);
    expect(cubos.map((cubo) => cubo.count)).toEqual([2, 2, 3, 2, 1, 1, 0, 1]);
    // El cubo lleno nombra sus extremos, y el vacío **no nombra ninguno**: hay
    // diferencia entre "no hay ninguno" y "hay uno que no sé cuál es".
    expect(cubos[2]).toEqual({ count: 3, lowestUsd: 400, highestUsd: 400 });
    expect(cubos[6]).toEqual({ count: 0 });
    // El más caro entra: `width_bucket` deja el máximo en el cubo N+1, que no
    // existe, y el aviso más caro desaparecería del histograma que dice cuál es
    // el más caro.
    expect(cubos[7]).toEqual({ count: 1, lowestUsd: 900, highestUsd: 900 });
  });

  /**
   * **La invariante de la 18.9, escrita como aserción y no como estructura.**
   * Un `width_bucket` en el repositorio es hoy una propiedad de cómo está
   * escrito el adaptador; esto la convierte en algo que se puede romper y se
   * nota. Es la prueba que tiene que seguir en verde si alguna vez se desprende
   * el reparto a una función compartida (18.28).
   */
  it("devuelve exactamente los mismos cubos que la faceta de la búsqueda", async () => {
    const cubos = await tally.tallyForZone(CIUDAD, ZONA);
    const facetados = await facets.countFacets({ cityId: CIUDAD, zoneIds: [ZONA] }, []);

    expect(cubos).toEqual(facetados.byPriceBucket);
  });

  it("la zona de al lado no entra, ni siquiera siendo de la misma ciudad", async () => {
    const cubos = await tally.tallyForZone(CIUDAD, ZONA);

    // $1.500 movería el extremo de arriba y repartiría los doce distinto, así
    // que la fuga no sería un número de más: sería otro histograma entero.
    expect(cubos.some((cubo) => cubo.highestUsd === VECINO_USD)).toBe(false);
    // Y el positivo: pedida por su nombre, esa zona sí devuelve su aviso.
    const vecina = await tally.tallyForZone(CIUDAD, ZONA_VECINA);
    expect(vecina.reduce((suma, cubo) => suma + cubo.count, 0)).toBe(1);
  });

  it("el aislamiento de ciudad no tiene excepción: la otra ciudad da cero (D5)", async () => {
    // Las dos zonas se llaman igual, que es el caso que el esquema permite. El
    // id de la zona pertenece a la otra ciudad, así que la respuesta honesta es
    // vacía y no la de la zona homónima.
    const cubos = await tally.tallyForZone(CIUDAD, ZONA_DE_LA_OTRA);

    expect(cubos.map((cubo) => cubo.count)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(cubos.some((cubo) => cubo.highestUsd === OTRA_CIUDAD_USD)).toBe(false);
  });

  it("un aviso vencido por reloj no entra, aunque su rótulo siga diciendo activo (21.1)", async () => {
    const cubos = await tally.tallyForZone(CIUDAD, ZONA);

    // Es la regla que vive en el `WHERE` compartido de `countFacets`, y llega
    // hasta acá por composición. Los $1.700 moverían el extremo de arriba, así
    // que un olvido no daría un número de más: daría los ocho cubos distintos.
    expect(cubos.some((cubo) => cubo.highestUsd === VENCIDO_POR_RELOJ_USD)).toBe(false);
    expect(cubos.reduce((suma, cubo) => suma + cubo.count, 0)).toBe(PRECIOS.length);
  });
});
