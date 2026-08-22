import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SearchCriteria } from "../../src/modules/listing-search/domain/search-criteria";
import {
  DrizzleFacetedSearch,
  type FacetedSearchDatabase,
} from "../../src/modules/listing-search/infrastructure/drizzle-faceted-search";
import {
  DrizzleListingSearch,
  type SearchDatabase,
} from "../../src/modules/listing-search/infrastructure/drizzle-listing-search";
import * as schema from "../../src/shared/db/schema";

/**
 * Task 14.11 contra Postgres real.
 *
 * **Lo que se prueba acá no es que la suma dé.** Es que el número que el
 * producto promete sea el número que hay: la regla transversal 3 del fundador
 * dice "todo conteo es real, si una etiqueta dice 9, hay 9", y un conteo que
 * viene de otra consulta que la que trae las filas es un número que puede
 * mentir sin que nadie se entere. Por eso cada aserción de total se compara
 * contra `DrizzleListingSearch` — el motor que realmente dibuja la lista —
 * y no contra una constante escrita a mano.
 *
 * Un fake en memoria filtraría porque fue escrito para filtrar. Acá se prueba
 * que el SQL lo hace, igual que en tests/integration/listing-search.test.ts.
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
const search = new DrizzleListingSearch(db as unknown as SearchDatabase);

const MARACAIBO = randomUUID();
const DISTRITO = randomUUID();

const MCBO_CENTRO = randomUUID();
const MCBO_NORTE = randomUUID();
/** Curada y ofrecida en el filtro, sin un solo aviso. El caso de la regla 4. */
const MCBO_VACIA = randomUUID();
const DC_CENTRO = randomUUID();

const ANA = randomUUID();

/** Los cinco activos de Maracaibo. */
const A1 = randomUUID();
const A2 = randomUUID();
const A3 = randomUUID();
const A4 = randomUUID();
const A5 = randomUUID();
/** Mismo sitio, mismo precio, misma cantidad de cuartos: sólo cambia el estado. */
const VENCIDO = randomUUID();
const OCULTO = randomUUID();
/** Caracas, y su única razón de existir es que ningún conteo lo alcance. */
const D1 = randomUUID();

/** Todas las zonas que el filtro ofrecería, incluida la que no tiene nada. */
const ZONAS_OFRECIDAS = [MCBO_CENTRO, MCBO_NORTE, MCBO_VACIA] as const;

interface Fixture {
  readonly id: string;
  readonly zoneId: string;
  readonly cityId: string;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly areaM2: number;
  readonly propertyType: string;
  readonly publisherType: string;
  readonly status: string;
  readonly hasPowerPlant?: boolean;
  readonly hasRegularWater?: boolean;
  readonly isFurnished?: boolean;
  readonly hasSecurity?: boolean;
  readonly hasAppliances?: boolean;
}

async function insertListing(fixture: Fixture) {
  await pool.query(
    `INSERT INTO "listing" (id, publisher_id, publisher_type, property_type, city_id, zone_id, title,
       description, price_usd, rooms, area_m2, bathrooms, parking_spots,
       has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
       contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,'Apartamento','x',$7,$8,$9,2,1,
       $10,$11,$12,$13,$14,
       'whatsapp','04121234567',$15,now(),now() + interval '30 days')`,
    [
      fixture.id,
      ANA,
      fixture.publisherType,
      fixture.propertyType,
      fixture.cityId,
      fixture.zoneId,
      fixture.priceUsd,
      fixture.rooms,
      fixture.areaM2,
      fixture.hasPowerPlant ?? false,
      fixture.hasRegularWater ?? false,
      fixture.isFurnished ?? false,
      fixture.hasSecurity ?? false,
      fixture.hasAppliances ?? false,
      fixture.status,
    ],
  );
}

beforeAll(async () => {
  for (const [city, name] of [
    [MARACAIBO, "Maracaibo"],
    [DISTRITO, "Distrito Capital"],
  ] as const) {
    await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [city, `${name} ${city}`]);
  }
  for (const [zone, city, name] of [
    [MCBO_CENTRO, MARACAIBO, "Centro"],
    [MCBO_NORTE, MARACAIBO, "Norte"],
    [MCBO_VACIA, MARACAIBO, "Sin avisos"],
    [DC_CENTRO, DISTRITO, "Centro"],
  ] as const) {
    await pool.query(
      `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
      [zone, city, name],
    );
  }
  await pool.query(`INSERT INTO "user" (id, email) VALUES ($1,$2)`, [ANA, `ana-${ANA}@ej.com`]);

  await insertListing({
    id: A1,
    zoneId: MCBO_CENTRO,
    cityId: MARACAIBO,
    priceUsd: 200,
    rooms: 1,
    areaM2: 40,
    propertyType: "apartamento",
    publisherType: "owner",
    status: "active",
  });
  await insertListing({
    id: A2,
    zoneId: MCBO_CENTRO,
    cityId: MARACAIBO,
    priceUsd: 300,
    rooms: 2,
    areaM2: 60,
    propertyType: "apartamento",
    publisherType: "owner",
    status: "active",
    hasPowerPlant: true,
    isFurnished: true,
  });
  await insertListing({
    id: A3,
    zoneId: MCBO_CENTRO,
    cityId: MARACAIBO,
    priceUsd: 500,
    rooms: 3,
    areaM2: 90,
    propertyType: "casa",
    publisherType: "broker",
    status: "active",
    isFurnished: true,
  });
  await insertListing({
    id: A4,
    zoneId: MCBO_NORTE,
    cityId: MARACAIBO,
    priceUsd: 400,
    rooms: 2,
    areaM2: 70,
    propertyType: "apartamento",
    publisherType: "broker",
    status: "active",
    hasPowerPlant: true,
    hasRegularWater: true,
  });
  await insertListing({
    id: A5,
    zoneId: MCBO_NORTE,
    cityId: MARACAIBO,
    priceUsd: 900,
    rooms: 5,
    areaM2: 150,
    propertyType: "quinta",
    publisherType: "owner",
    status: "active",
    hasSecurity: true,
    hasAppliances: true,
  });
  await insertListing({
    id: VENCIDO,
    zoneId: MCBO_CENTRO,
    cityId: MARACAIBO,
    priceUsd: 300,
    rooms: 2,
    areaM2: 60,
    propertyType: "apartamento",
    publisherType: "owner",
    status: "expired",
    isFurnished: true,
  });
  await insertListing({
    id: OCULTO,
    zoneId: MCBO_NORTE,
    cityId: MARACAIBO,
    priceUsd: 300,
    rooms: 2,
    areaM2: 60,
    propertyType: "apartamento",
    publisherType: "broker",
    status: "hidden",
    hasPowerPlant: true,
  });
  await insertListing({
    id: D1,
    zoneId: DC_CENTRO,
    cityId: DISTRITO,
    priceUsd: 300,
    rooms: 2,
    areaM2: 60,
    propertyType: "apartamento",
    publisherType: "owner",
    status: "active",
    isFurnished: true,
  });
});

afterAll(async () => {
  await pool.query(`DELETE FROM "user" WHERE id = $1`, [ANA]);
  await pool.query(`DELETE FROM "city" WHERE id = ANY($1)`, [[MARACAIBO, DISTRITO]]);
  await pool.end();
});

describe('"si una etiqueta dice 9, hay 9" (regla transversal 3, task 14.11)', () => {
  /**
   * El total no se compara contra un número escrito acá: se compara contra la
   * cantidad de filas que devuelve el motor que dibuja la lista. Un conteo que
   * se calcula por su cuenta puede quedar bien en este archivo y mal en la
   * pantalla; éste no puede.
   */
  const CASOS: readonly (readonly [string, SearchCriteria])[] = [
    ["sin filtros", { cityId: MARACAIBO }],
    ["por zona", { cityId: MARACAIBO, zoneId: MCBO_CENTRO }],
    ["por habitaciones", { cityId: MARACAIBO, minRooms: 3 }],
    ["por precio", { cityId: MARACAIBO, minPriceUsd: 300, maxPriceUsd: 500 }],
    ["por área", { cityId: MARACAIBO, minAreaM2: 70 }],
    ["zona y habitaciones juntas", { cityId: MARACAIBO, zoneId: MCBO_NORTE, minRooms: 2 }],
    ["una combinación sin resultados", { cityId: MARACAIBO, zoneId: MCBO_VACIA }],
    ["otra ciudad", { cityId: DISTRITO }],
  ];

  it.each(CASOS)(
    "el total coincide con las filas de la búsqueda equivalente: %s",
    async (_name, criteria) => {
      const [counts, rows] = await Promise.all([
        facets.countFacets(criteria, ZONAS_OFRECIDAS),
        search.search(criteria),
      ]);

      expect(counts.total).toBe(rows.length);
    },
  );

  it("cuenta cinco activos en Maracaibo y uno en Distrito Capital", async () => {
    expect((await facets.countFacets({ cityId: MARACAIBO }, ZONAS_OFRECIDAS)).total).toBe(5);
    expect((await facets.countFacets({ cityId: DISTRITO }, [DC_CENTRO])).total).toBe(1);
  });
});

describe('"ninguna opción lleva a un vacío" (regla transversal 4)', () => {
  /**
   * La zona curada sin avisos devuelve **cero**, no desaparece. Un mapa al que
   * le falta la clave deja a la pantalla sin poder distinguir "no hay" de "no
   * pregunté", y esa diferencia es justo la que la regla 4 pide mostrar.
   */
  it("devuelve cero para una zona ofrecida que no tiene un solo aviso", async () => {
    const counts = await facets.countFacets({ cityId: MARACAIBO }, ZONAS_OFRECIDAS);

    expect(counts.byZone).toHaveProperty(MCBO_VACIA);
    expect(counts.byZone[MCBO_VACIA]).toBe(0);
  });

  it("devuelve cero para un tipo de propiedad y un atributo que nadie declaró", async () => {
    const counts = await facets.countFacets({ cityId: MARACAIBO }, ZONAS_OFRECIDAS);

    expect(counts.byPropertyType.anexo).toBe(0);
    expect(counts.byPropertyType.habitacion).toBe(0);
    expect(counts.byAttribute.hasRegularWater).toBe(1);
  });

  it("devuelve cero, y no una clave ausente, cuando la búsqueda entera está vacía", async () => {
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, minPriceUsd: 100000 },
      ZONAS_OFRECIDAS,
    );

    expect(counts.total).toBe(0);
    expect(counts.byZone).toEqual({ [MCBO_CENTRO]: 0, [MCBO_NORTE]: 0, [MCBO_VACIA]: 0 });
    expect(counts.byMinRooms).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
    expect(counts.byPublisherType).toEqual({ owner: 0, broker: 0 });
  });
});

describe("aislamiento de ciudad (design.md D5)", () => {
  it("no mete un aviso de Caracas en ningún conteo de Maracaibo", async () => {
    // D1 cuesta 300, tiene 2 cuartos, 60 m², es apartamento, es de dueño y
    // está amoblado — cae dentro de cada rango de abajo. Una consulta a la que
    // le falte el predicado de ciudad lo suma acá y en ningún otro lado.
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, minPriceUsd: 0, maxPriceUsd: 100000 },
      ZONAS_OFRECIDAS,
    );

    expect(counts.total).toBe(5);
    expect(counts.byMinRooms[2]).toBe(4);
    expect(counts.byPropertyType.apartamento).toBe(3);
    expect(counts.byPublisherType.owner).toBe(3);
    expect(counts.byAttribute.isFurnished).toBe(2);
  });

  it("devuelve cero para una zona de otra ciudad, aunque tenga avisos", async () => {
    // DC_CENTRO tiene un aviso activo. Ofrecido dentro de una búsqueda de
    // Maracaibo tiene que valer cero: el conteo pertenece a la ciudad, no a
    // la zona que le pasaron.
    const counts = await facets.countFacets({ cityId: MARACAIBO }, [...ZONAS_OFRECIDAS, DC_CENTRO]);

    expect(counts.byZone[DC_CENTRO]).toBe(0);
  });

  it("no mete un aviso de Maracaibo en los conteos de Caracas", async () => {
    const counts = await facets.countFacets({ cityId: DISTRITO }, [DC_CENTRO]);

    expect(counts.byZone).toEqual({ [DC_CENTRO]: 1 });
    expect(counts.byPropertyType).toEqual({
      apartamento: 1,
      casa: 0,
      quinta: 0,
      anexo: 0,
      habitacion: 0,
    });
  });
});

describe("una faceta no se filtra a sí misma (task 14.11)", () => {
  /**
   * **El caso sutil, y es el que deja el filtro usable.** Con "3 habitaciones"
   * ya elegido, el conteo de la opción "2" tiene que decir cuántos habría *si
   * cambiara* a 2, no cero. Un motor que aplica todos los filtros a todos los
   * conteos apaga cada opción que no es la elegida, y cambiar de opinión pasa
   * a parecer imposible.
   */
  it("el conteo de habitaciones ignora el filtro de habitaciones", async () => {
    const counts = await facets.countFacets({ cityId: MARACAIBO, minRooms: 3 }, ZONAS_OFRECIDAS);

    expect(counts.total).toBe(2);
    // Los cinco activos tienen 1, 2, 2, 3 y 5 cuartos.
    expect(counts.byMinRooms).toEqual({ 1: 5, 2: 4, 3: 2, 4: 1 });
  });

  it("el conteo de zonas ignora el filtro de zona", async () => {
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, zoneId: MCBO_NORTE },
      ZONAS_OFRECIDAS,
    );

    expect(counts.total).toBe(2);
    expect(counts.byZone).toEqual({
      [MCBO_CENTRO]: 3,
      [MCBO_NORTE]: 2,
      [MCBO_VACIA]: 0,
    });
  });

  /** Lo que la faceta ignora es *su propio* filtro, no los demás. */
  it("el conteo de zonas sí refleja los otros filtros activos", async () => {
    const counts = await facets.countFacets({ cityId: MARACAIBO, minRooms: 3 }, ZONAS_OFRECIDAS);

    // A3 (3 cuartos, Centro) y A5 (5 cuartos, Norte) son los únicos que quedan.
    expect(counts.byZone).toEqual({
      [MCBO_CENTRO]: 1,
      [MCBO_NORTE]: 1,
      [MCBO_VACIA]: 0,
    });
  });

  it("el conteo de habitaciones sí refleja el filtro de zona", async () => {
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, zoneId: MCBO_NORTE },
      ZONAS_OFRECIDAS,
    );

    // Norte tiene A4 (2 cuartos) y A5 (5 cuartos).
    expect(counts.byMinRooms).toEqual({ 1: 2, 2: 2, 3: 1, 4: 1 });
  });

  it("los dos filtros propios se ignoran a la vez, cada uno en su faceta", async () => {
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, zoneId: MCBO_CENTRO, minRooms: 3 },
      ZONAS_OFRECIDAS,
    );

    expect(counts.total).toBe(1); // A3
    // Zonas: se ignora la zona, se respeta minRooms >= 3.
    expect(counts.byZone).toEqual({ [MCBO_CENTRO]: 1, [MCBO_NORTE]: 1, [MCBO_VACIA]: 0 });
    // Habitaciones: se ignora minRooms, se respeta la zona (Centro: 1, 2 y 3).
    expect(counts.byMinRooms).toEqual({ 1: 3, 2: 2, 3: 1, 4: 0 });
  });
});

describe("las cinco facetas de atributo, tipo y publicador (F6)", () => {
  it("cuenta cada atributo declarado sobre el resultado filtrado", async () => {
    const counts = await facets.countFacets({ cityId: MARACAIBO }, ZONAS_OFRECIDAS);

    expect(counts.byAttribute).toEqual({
      hasPowerPlant: 2, // A2, A4
      hasRegularWater: 1, // A4
      isFurnished: 2, // A2, A3
      hasSecurity: 1, // A5
      hasAppliances: 1, // A5
    });
  });

  it("cuenta tipo de propiedad y tipo de publicador", async () => {
    const counts = await facets.countFacets({ cityId: MARACAIBO }, ZONAS_OFRECIDAS);

    expect(counts.byPropertyType).toEqual({
      apartamento: 3,
      casa: 1,
      quinta: 1,
      anexo: 0,
      habitacion: 0,
    });
    expect(counts.byPublisherType).toEqual({ owner: 3, broker: 2 });
  });

  it("estrecha esos conteos con el resto de los filtros", async () => {
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, zoneId: MCBO_NORTE },
      ZONAS_OFRECIDAS,
    );

    expect(counts.byAttribute).toEqual({
      hasPowerPlant: 1, // A4
      hasRegularWater: 1, // A4
      isFurnished: 0, // A2 y A3 son de Centro
      hasSecurity: 1, // A5
      hasAppliances: 1, // A5
    });
    expect(counts.byPublisherType).toEqual({ owner: 1, broker: 1 });
  });
});

describe("ni vencidos ni ocultos entran en un conteo (tasks 5.5/5.6)", () => {
  /**
   * VENCIDO y OCULTO comparten zona, precio y cantidad de cuartos con avisos
   * que sí cuentan, así que un conteo que los incluyera no se vería raro:
   * se vería como uno más. El estado es la única razón por la que faltan.
   */
  it("los deja fuera del total y de cada faceta", async () => {
    const counts = await facets.countFacets({ cityId: MARACAIBO }, ZONAS_OFRECIDAS);

    expect(counts.total).toBe(5);
    expect(counts.byZone[MCBO_CENTRO]).toBe(3); // sería 4 con VENCIDO
    expect(counts.byZone[MCBO_NORTE]).toBe(2); // sería 3 con OCULTO
    expect(counts.byMinRooms[2]).toBe(4); // sería 6 con los dos
    expect(counts.byAttribute.isFurnished).toBe(2); // VENCIDO también lo declara
    expect(counts.byAttribute.hasPowerPlant).toBe(2); // OCULTO también
    expect(counts.byPublisherType.broker).toBe(2); // sería 3 con OCULTO
  });

  it("tampoco cuando el rango de precio los abarca exactamente", async () => {
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, minPriceUsd: 300, maxPriceUsd: 300 },
      ZONAS_OFRECIDAS,
    );

    // Sólo A2 cuesta 300 y está activo. VENCIDO y OCULTO cuestan lo mismo.
    expect(counts.total).toBe(1);
    expect(counts.byZone).toEqual({ [MCBO_CENTRO]: 1, [MCBO_NORTE]: 0, [MCBO_VACIA]: 0 });
  });
});

describe("una sola consulta (task 14.11: el costo son los viajes de red)", () => {
  /**
   * **La razón por la que esta tarea existe.** Neon es Postgres serverless
   * sobre HTTP: ocho conteos en ocho consultas son ocho viajes de red, y eso
   * se siente en cada tecla. El adaptador tiene que resolver el total y las
   * seis facetas en una pasada, y esto lo prueba contando las consultas que
   * salen del handle en vez de confiar en que el `SELECT` se lea bien.
   */
  it("resuelve el total y las seis facetas en un solo viaje a la base", async () => {
    let queries = 0;
    const counting = new Pool({ connectionString: getTestDatabaseUrl() });
    const original = counting.query.bind(counting) as (...args: unknown[]) => unknown;
    counting.query = ((...args: unknown[]) => {
      queries += 1;
      return original(...args);
    }) as unknown as typeof counting.query;

    const counted = new DrizzleFacetedSearch(
      drizzle(counting, { schema }) as unknown as FacetedSearchDatabase,
    );
    await counted.countFacets({ cityId: MARACAIBO, minRooms: 2 }, ZONAS_OFRECIDAS);
    await counting.end();

    expect(queries).toBe(1);
  });
});
