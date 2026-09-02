import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildFilterPanel,
  type FilterPanelRequest,
} from "../../src/modules/listing-search/application/build-filter-panel";
import {
  MIN_LISTINGS_FOR_PRICE_HISTOGRAM,
  PRICE_HISTOGRAM_BUCKETS,
  priceHistogram,
} from "../../src/modules/listing-search/domain/price-histogram";
import type { SearchCriteria } from "../../src/modules/listing-search/domain/search-criteria";
import { withoutFilter } from "../../src/modules/listing-search/domain/search-panel";
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
/**
 * task 21.1. Idéntico a `VENCIDO` salvo en una cosa: su rótulo todavía dice
 * `active` porque el trabajo diario no pasó. Cae dentro de TODAS las facetas
 * —zona, precio, cuartos, tipo, publicador y `isFurnished`—, así que si algún
 * conteo lo sumara, se vería en varios números a la vez.
 */
const VENCIDO_POR_RELOJ = randomUUID();
/** Caracas, y su única razón de existir es que ningún conteo lo alcance. */
const D1 = randomUUID();

/** Todas las zonas que el filtro ofrecería, incluida la que no tiene nada. */
const ZONAS_OFRECIDAS = [MCBO_CENTRO, MCBO_NORTE, MCBO_VACIA] as const;

/**
 * **Una tercera ciudad, y existe sólo para el histograma (task 14.12).** Los
 * cinco de Maracaibo cuestan 200, 300, 400, 500 y 900: con el eje partido en
 * ocho cada uno cae en un cubo distinto, así que **no hay un solo cubo con dos
 * adentro** y un cubo de uno no distingue el más barato del más caro que
 * nombra. Tampoco llegan al piso de doce. Sumarle avisos a Maracaibo movería
 * cada número de este archivo; una ciudad aparte no toca ninguno.
 */
const CIUDAD_HISTOGRAMA = randomUUID();
const ZONA_H1 = randomUUID();
const ZONA_H2 = randomUUID();
const ZONAS_HISTOGRAMA = [ZONA_H1, ZONA_H2] as const;

/**
 * Doce avisos —justo el piso— repartidos alternadamente en las dos zonas, con
 * **tres de $400 idénticos**. El eje va de 200 a 900, así que cada cubo mide
 * 87,5 y quedan así: [200 220], [300 320], [400 400 400], [500 520], [600],
 * [700], vacío, [900].
 */
const PRECIOS_HISTOGRAMA = [200, 220, 300, 320, 400, 400, 400, 500, 520, 600, 700, 900] as const;

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
  /**
   * Minutos de vigencia contados desde el `now()` de Postgres, no una fecha
   * escrita a mano: un literal cambia de significado solo el día que el
   * calendario lo pasa, y la prueba sigue verde midiendo otra cosa. Negativo
   * = ya vencido.
   */
  readonly expiresInMinutes?: number;
}

const THIRTY_DAYS_IN_MINUTES = 30 * 24 * 60;

async function insertListing(fixture: Fixture) {
  await pool.query(
    `INSERT INTO "listing" (id, publisher_id, publisher_type, property_type, city_id, zone_id, title,
       description, price_usd, rooms, area_m2, bathrooms, parking_spots,
       has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
       contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,'Apartamento','x',$7,$8,$9,2,1,
       $10,$11,$12,$13,$14,
       'whatsapp','04121234567',$15,now(),now() + make_interval(mins => $16::int))`,
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
      fixture.expiresInMinutes ?? THIRTY_DAYS_IN_MINUTES,
    ],
  );
}

beforeAll(async () => {
  for (const [city, name] of [
    [MARACAIBO, "Maracaibo"],
    [DISTRITO, "Distrito Capital"],
    [CIUDAD_HISTOGRAMA, "Histograma"],
  ] as const) {
    await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [city, `${name} ${city}`]);
  }
  for (const [zone, city, name] of [
    [MCBO_CENTRO, MARACAIBO, "Centro"],
    [MCBO_NORTE, MARACAIBO, "Norte"],
    [MCBO_VACIA, MARACAIBO, "Sin avisos"],
    [DC_CENTRO, DISTRITO, "Centro"],
    [ZONA_H1, CIUDAD_HISTOGRAMA, "Una"],
    [ZONA_H2, CIUDAD_HISTOGRAMA, "Otra"],
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
    id: VENCIDO_POR_RELOJ,
    zoneId: MCBO_CENTRO,
    cityId: MARACAIBO,
    priceUsd: 300,
    rooms: 2,
    areaM2: 60,
    propertyType: "apartamento",
    publisherType: "owner",
    status: "active",
    isFurnished: true,
    expiresInMinutes: -60,
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

  for (const [index, priceUsd] of PRECIOS_HISTOGRAMA.entries()) {
    await insertListing({
      id: randomUUID(),
      zoneId: index % 2 === 0 ? ZONA_H1 : ZONA_H2,
      cityId: CIUDAD_HISTOGRAMA,
      priceUsd,
      rooms: 2,
      areaM2: 60,
      // Los tres de $400 son quinta: es la forma de pedir "sólo los precios
      // idénticos" con un filtro que el histograma SÍ respeta, porque el de
      // precio lo ignora a propósito.
      propertyType: priceUsd === 400 ? "quinta" : "apartamento",
      publisherType: "owner",
      status: "active",
    });
  }
});

afterAll(async () => {
  await pool.query(`DELETE FROM "user" WHERE id = $1`, [ANA]);
  await pool.query(`DELETE FROM "city" WHERE id = ANY($1)`, [
    [MARACAIBO, DISTRITO, CIUDAD_HISTOGRAMA],
  ]);
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
    ["por zona", { cityId: MARACAIBO, zoneIds: [MCBO_CENTRO] }],
    ["por habitaciones", { cityId: MARACAIBO, minRooms: 3 }],
    ["por precio", { cityId: MARACAIBO, minPriceUsd: 300, maxPriceUsd: 500 }],
    ["por área", { cityId: MARACAIBO, minAreaM2: 70 }],
    ["zona y habitaciones juntas", { cityId: MARACAIBO, zoneIds: [MCBO_NORTE], minRooms: 2 }],
    ["una combinación sin resultados", { cityId: MARACAIBO, zoneIds: [MCBO_VACIA] }],
    ["otra ciudad", { cityId: DISTRITO }],
    // Los criterios de las tasks 14.6 a 14.9. Si uno llegara a la búsqueda y
    // no a las facetas, el botón diría un número y la lista traería otro —
    // que es exactamente la forma en que un conteo empieza a mentir.
    ["por varias zonas", { cityId: MARACAIBO, zoneIds: [MCBO_CENTRO, MCBO_NORTE] }],
    ["por tipo de publicador", { cityId: MARACAIBO, publisherType: "owner" }],
    ["por tipo de propiedad", { cityId: MARACAIBO, propertyType: "apartamento" }],
    ["por un atributo", { cityId: MARACAIBO, attributes: ["hasPowerPlant"] }],
    [
      "por dos atributos, que se exigen los dos",
      { cityId: MARACAIBO, attributes: ["hasPowerPlant", "hasRegularWater"] },
    ],
    [
      "por todo a la vez",
      {
        cityId: MARACAIBO,
        zoneIds: [MCBO_CENTRO, MCBO_NORTE],
        minRooms: 2,
        minPriceUsd: 100,
        maxPriceUsd: 1000,
        propertyType: "apartamento",
        publisherType: "broker",
        attributes: ["hasPowerPlant"],
      },
    ],
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

describe("vigente son DOS condiciones, también para los conteos (task 21.1)", () => {
  /**
   * **Un conteo que no coincide con su propia lista es peor que un conteo
   * viejo.** Las filas y las facetas salen de dos consultas distintas sobre
   * la misma tabla; si una mira el reloj y la otra no, la pantalla dice «9
   * avisos en Chacao» encima de una lista de ocho, y el número deja de ser
   * verificable justo donde la regla transversal 3 lo exige — «si una
   * etiqueta dice 9, hay 9».
   *
   * Por eso este bloque no inventa una aserción nueva: pone una fila que sólo
   * el reloj distingue y deja que la comparación contra `DrizzleListingSearch`
   * que ya vive arriba haga el trabajo. Con las dos consultas de acuerdo, el
   * total baja de seis a cinco en las dos a la vez.
   */
  it("la fixture es realmente el caso: rótulo `active` y fecha ya pasada", async () => {
    const { rows } = await pool.query<{ status: string; vencido: boolean }>(
      `SELECT status, expires_at < now() AS vencido FROM "listing" WHERE id = $1`,
      [VENCIDO_POR_RELOJ],
    );

    expect(rows[0]).toEqual({ status: "active", vencido: true });
  });

  it("no cuenta el aviso cuya fecha ya pasó, aunque su rótulo siga diciendo active", async () => {
    const counts = await facets.countFacets({ cityId: MARACAIBO }, ZONAS_OFRECIDAS);

    // Cae en todas estas facetas: si alguna lo sumara, se vería acá. Los
    // números son los mismos que antes de que la fila existiera — que es la
    // forma de decir que la fila es alcanzable y aun así no se cuenta.
    expect(counts.total).toBe(5);
    expect(counts.byZone[MCBO_CENTRO]).toBe(3);
    expect(counts.byMinRooms[2]).toBe(4);
    expect(counts.byPropertyType.apartamento).toBe(3);
    expect(counts.byPublisherType.owner).toBe(3);
    expect(counts.byAttribute.isFurnished).toBe(2);
    expect(counts.cityTotal).toBe(5);
  });

  it("el total y las filas siguen de acuerdo con la fila vencida por reloj adentro", async () => {
    // **El discriminador entre arreglar una consulta y arreglar las dos.**
    // Con el reloj sólo en las filas este total diría seis sobre una lista de
    // cinco; con el reloj sólo en los conteos, cinco sobre una lista de seis.
    const criteria = { cityId: MARACAIBO, zoneIds: [MCBO_CENTRO] } as const;
    const [counts, rows] = await Promise.all([
      facets.countFacets(criteria, ZONAS_OFRECIDAS),
      search.search(criteria),
    ]);

    expect(counts.total).toBe(rows.length);
    expect(rows.map((row) => row.id)).not.toContain(VENCIDO_POR_RELOJ);
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
      { cityId: MARACAIBO, zoneIds: [MCBO_NORTE] },
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
      { cityId: MARACAIBO, zoneIds: [MCBO_NORTE] },
      ZONAS_OFRECIDAS,
    );

    // Norte tiene A4 (2 cuartos) y A5 (5 cuartos).
    expect(counts.byMinRooms).toEqual({ 1: 2, 2: 2, 3: 1, 4: 1 });
  });

  it("los dos filtros propios se ignoran a la vez, cada uno en su faceta", async () => {
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, zoneIds: [MCBO_CENTRO], minRooms: 3 },
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
      { cityId: MARACAIBO, zoneIds: [MCBO_NORTE] },
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
    // Con las nueve relajaciones, el escalón siguiente de precio, la ciudad
    // pelada y el histograma adentro: es la pregunta completa que hace la
    // pantalla, no una reducida escrita para que el número dé.
    const counts = await counted.countFacets(
      {
        cityId: MARACAIBO,
        zoneIds: [MCBO_CENTRO],
        minPriceUsd: 200,
        maxPriceUsd: 400,
        minRooms: 2,
      },
      ZONAS_OFRECIDAS,
      { minPriceUsd: 200, maxPriceUsd: 900 },
    );
    await counting.end();

    expect(queries).toBe(1);
    // Y el viaje único trae también los ocho cubos del precio (task 14.12):
    // sin esta línea, la afirmación de arriba seguiría en verde el día que el
    // histograma se fuera a una segunda consulta que este handle no cuenta.
    expect(counts.byPriceBucket).toHaveLength(PRICE_HISTOGRAM_BUCKETS);
  });
});

/**
 * **La faceta de precio (task 14.12, rebanada B).** El dominio ya sabía dibujar
 * un histograma; no tenía de dónde sacar la cuenta repartida. Acá se prueba que
 * sale de la MISMA sentencia, y que ningún número es una constante suelta: cada
 * suma se compara contra el total que la consulta reporta y contra las filas.
 */
describe("el precio se reparte en ocho cubos, en el mismo viaje (task 14.12)", () => {
  /** Los cinco activos de Maracaibo cuestan 200, 300, 400, 500 y 900. */
  const TODA_LA_CIUDAD: SearchCriteria = { cityId: MARACAIBO };

  function suma(tally: readonly { readonly count: number }[]): number {
    return tally.reduce((total, bucket) => total + bucket.count, 0);
  }

  it("los ocho cubos suman el total de la consulta, y ése es el de la lista", async () => {
    const [counts, rows] = await Promise.all([
      facets.countFacets(TODA_LA_CIUDAD, ZONAS_OFRECIDAS),
      search.search(TODA_LA_CIUDAD),
    ]);

    expect(counts.byPriceBucket).toHaveLength(PRICE_HISTOGRAM_BUCKETS);
    expect(suma(counts.byPriceBucket)).toBe(counts.total);
    expect(suma(counts.byPriceBucket)).toBe(rows.length);
  });

  /**
   * **La trampa del `+ 1`.** `width_bucket(precio, 200, 900, 8)` manda el 900
   * —el máximo, el que fija el borde de arriba— al cubo **nueve**, que no
   * existe: sin plegarlo, el aviso más caro desaparece justo del histograma
   * que dice cuál es el más caro y la suma da cuatro sobre cinco filas.
   */
  it("el aviso más caro cae en el último cubo y no en un noveno que no existe", async () => {
    const counts = await facets.countFacets(TODA_LA_CIUDAD, ZONAS_OFRECIDAS);

    const ultimo = counts.byPriceBucket[PRICE_HISTOGRAM_BUCKETS - 1];
    expect(ultimo).toEqual({ count: 1, lowestUsd: 900, highestUsd: 900 });
    // Y el eje que el dominio deriva de esos cubos llega hasta el 900.
    expect(Math.max(...counts.byPriceBucket.flatMap((b) => b.highestUsd ?? []))).toBe(900);
  });

  it("cada cubo nombra precios reales, y el vacío no nombra ninguno", async () => {
    const counts = await facets.countFacets(TODA_LA_CIUDAD, ZONAS_OFRECIDAS);

    let anterior = 0;
    for (const bucket of counts.byPriceBucket) {
      if (bucket.count === 0) {
        expect(bucket.lowestUsd).toBeUndefined();
        expect(bucket.highestUsd).toBeUndefined();
        continue;
      }
      expect(bucket.lowestUsd).toBeGreaterThan(anterior);
      expect(bucket.highestUsd).toBeGreaterThanOrEqual(bucket.lowestUsd as number);
      anterior = bucket.highestUsd as number;
    }
    // Orden ascendente de verdad: el recorrido de arriba lo exigió cubo a cubo.
    expect(anterior).toBe(900);
  });

  /**
   * **El precio tampoco se filtra a sí mismo, y acá la regla de la casa pesa
   * más que en las otras seis.** El histograma existe para que alguien ELIJA
   * un rango: contado contra su propio filtro, las barras de afuera caen a
   * cero justo cuando se lo mira para moverse.
   */
  it("elegir un rango no vacía las barras de afuera: el precio no se cuenta contra sí mismo", async () => {
    const conRango = await facets.countFacets(
      { cityId: MARACAIBO, minPriceUsd: 300, maxPriceUsd: 400 },
      ZONAS_OFRECIDAS,
    );
    const sinRango = await facets.countFacets(TODA_LA_CIUDAD, ZONAS_OFRECIDAS);

    expect(conRango.total).toBe(2);
    expect(suma(conRango.byPriceBucket)).toBe(5);
    expect(conRango.byPriceBucket).toEqual(sinRango.byPriceBucket);
  });

  it("pero sí respeta los otros filtros: la zona angosta el histograma", async () => {
    const [counts, rows] = await Promise.all([
      facets.countFacets({ cityId: MARACAIBO, zoneIds: [MCBO_NORTE] }, ZONAS_OFRECIDAS),
      search.search({ cityId: MARACAIBO, zoneIds: [MCBO_NORTE] }),
    ]);

    // Norte tiene A4 ($400) y A5 ($900), y son los dos extremos del eje.
    expect(suma(counts.byPriceBucket)).toBe(rows.length);
    expect(counts.byPriceBucket[0]).toEqual({ count: 1, lowestUsd: 400, highestUsd: 400 });
    expect(counts.byPriceBucket[PRICE_HISTOGRAM_BUCKETS - 1]).toEqual({
      count: 1,
      lowestUsd: 900,
      highestUsd: 900,
    });
  });

  /**
   * **La consulta reparte igual por debajo del piso, y es una decisión.**
   * Saltearlo exigiría saber el total ANTES, o sea otro viaje de red para
   * ahorrarse unas columnas de una sentencia que ya recorre esas filas.
   * Negarse a dibujar es del dominio: la faceta trae los cinco repartidos.
   */
  it("con menos de doce igual reparte, y es el dominio el que se niega a dibujar", async () => {
    const counts = await facets.countFacets(TODA_LA_CIUDAD, ZONAS_OFRECIDAS);

    expect(counts.total).toBeLessThan(MIN_LISTINGS_FOR_PRICE_HISTOGRAM);
    expect(suma(counts.byPriceBucket)).toBe(counts.total);
    expect(priceHistogram(counts.byPriceBucket)).toEqual({ kind: "insufficient", total: 5 });
  });

  /**
   * Sin filas no hay mínimo ni máximo, y `width_bucket` con los dos extremos
   * nulos no rompe: devuelve nulo y ninguna fila cae en ningún cubo. El filtro
   * es el área y no el precio a propósito — el precio no angosta esta faceta.
   */
  it("sin una sola fila los ocho cubos vienen en cero, sin inventar un precio", async () => {
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, minAreaM2: 100_000 },
      ZONAS_OFRECIDAS,
    );

    expect(counts.total).toBe(0);
    expect(counts.byPriceBucket).toEqual(
      Array.from({ length: PRICE_HISTOGRAM_BUCKETS }, () => ({ count: 0 })),
    );
  });

  /**
   * **Varios avisos al mismo precio son `lo === hi`, y ahí `width_bucket`
   * aborta la consulta entera** con "lower bound cannot equal upper bound" —
   * no devuelve un número raro, tira error. Sin ensanchar el borde de arriba
   * esta llamada no respondería nada. Todo cae en el primer cubo, que es lo
   * honesto: un solo precio no tiene distribución que mostrar.
   */
  it("con varios avisos al mismo precio el eje no tiene ancho, y no rompe", async () => {
    const counts = await facets.countFacets(
      { cityId: CIUDAD_HISTOGRAMA, propertyType: "quinta" },
      ZONAS_HISTOGRAMA,
    );

    expect(counts.total).toBe(3);
    expect(counts.byPriceBucket[0]).toEqual({ count: 3, lowestUsd: 400, highestUsd: 400 });
    expect(suma(counts.byPriceBucket)).toBe(3);
  });

  /**
   * **Un cubo con varios adentro es lo que Maracaibo no tiene**, y sin él el
   * `min` y el `max` de un cubo son el mismo número: el de [200 220] es el que
   * hace que confundirlos se vea. El `toEqual` de los ocho de una vez afirma
   * además que el `GROUP BY` de zona **no multiplica** el histograma: los doce
   * están en dos zonas, y un arreglo sumado por grupo daría veinticuatro.
   */
  it("un cubo con varios adentro nombra el más barato y el más caro, no uno solo", async () => {
    const [counts, rows] = await Promise.all([
      facets.countFacets({ cityId: CIUDAD_HISTOGRAMA }, ZONAS_HISTOGRAMA),
      search.search({ cityId: CIUDAD_HISTOGRAMA }),
    ]);

    expect(counts.byPriceBucket).toEqual([
      { count: 2, lowestUsd: 200, highestUsd: 220 },
      { count: 2, lowestUsd: 300, highestUsd: 320 },
      { count: 3, lowestUsd: 400, highestUsd: 400 },
      { count: 2, lowestUsd: 500, highestUsd: 520 },
      { count: 1, lowestUsd: 600, highestUsd: 600 },
      { count: 1, lowestUsd: 700, highestUsd: 700 },
      { count: 0 },
      { count: 1, lowestUsd: 900, highestUsd: 900 },
    ]);
    expect(suma(counts.byPriceBucket)).toBe(counts.total);
    expect(counts.total).toBe(rows.length);
  });

  /** **El único caso en el que el dominio SÍ dibuja**: la A y la B encajando. */
  it("desde el piso el dominio dibuja, y cada número sale de estas filas", async () => {
    const counts = await facets.countFacets({ cityId: CIUDAD_HISTOGRAMA }, ZONAS_HISTOGRAMA);

    expect(counts.total).toBe(MIN_LISTINGS_FOR_PRICE_HISTOGRAM);
    expect(priceHistogram(counts.byPriceBucket)).toMatchObject({
      kind: "distribution",
      total: 12,
      // Los dos rótulos del eje: el más barato y el más caro que se encontró.
      lowestUsd: 200,
      highestUsd: 900,
      // «La mayoría está entre $200 y $400»: siete de doce, la franja contigua
      // más angosta que pasa de la mitad, rotulada con precios reales.
      typical: { fromUsd: 200, toUsd: 400, count: 7 },
    });
  });

  it("ni el vencido, ni el oculto, ni el de la otra ciudad entran en un cubo", async () => {
    // Los tres cuestan $300 y caen en el segundo cubo del eje 200–900; si
    // alguno entrara, ese cubo contaría más de uno y la suma pasaría de cinco.
    const counts = await facets.countFacets(TODA_LA_CIUDAD, ZONAS_OFRECIDAS);

    expect(counts.byPriceBucket[1]).toEqual({ count: 1, lowestUsd: 300, highestUsd: 300 });
    expect(suma(counts.byPriceBucket)).toBe(5);
  });
});

describe("las salidas del vacío salen de la misma consulta (F10 y F11)", () => {
  /**
   * **Contar cuántos daría cada relajación no puede volverse una consulta por
   * filtro.** Cada `withoutFilter` de acá se compara contra soltar el filtro
   * DE VERDAD y volver a contar: si la columna del `COUNT(*) FILTER` y el
   * criterio relajado no dan lo mismo, el botón promete un número que la
   * lista no va a entregar.
   */
  const CRITERIO: SearchCriteria = {
    cityId: MARACAIBO,
    zoneIds: [MCBO_CENTRO],
    minPriceUsd: 100,
    maxPriceUsd: 250,
    minRooms: 2,
  };

  it("cada relajación trae el número que traería soltar ese filtro de verdad", async () => {
    const counts = await facets.countFacets(CRITERIO, ZONAS_OFRECIDAS);

    // La búsqueda entera no encuentra nada: Centro no tiene ningún aviso de
    // dos habitaciones bajo $250.
    expect(counts.total).toBe(0);

    for (const filter of ["zone", "price", "rooms"] as const) {
      const soltado = await facets.countFacets(withoutFilter(CRITERIO, filter), []);
      expect([filter, counts.withoutFilter[filter]]).toEqual([filter, soltado.total]);
    }
  });

  it("y ese número es el de las filas que la lista realmente trae", async () => {
    const counts = await facets.countFacets(CRITERIO, ZONAS_OFRECIDAS);
    const rows = await search.search(withoutFilter(CRITERIO, "price"));

    // Sin el precio quedan A2 y A3 en Centro con dos habitaciones o más.
    expect(counts.withoutFilter.price).toBe(rows.length);
    expect(counts.withoutFilter.price).toBeGreaterThan(0);
  });

  it("un filtro que nadie puso no promete nada: devuelve el total", async () => {
    const counts = await facets.countFacets({ cityId: MARACAIBO, minRooms: 2 }, ZONAS_OFRECIDAS);

    expect(counts.withoutFilter.publisherType).toBe(counts.total);
    expect(counts.withoutFilter.isFurnished).toBe(counts.total);
  });

  it("«Limpiar todo» promete la ciudad entera, y sigue siendo esta ciudad", async () => {
    const counts = await facets.countFacets(CRITERIO, ZONAS_OFRECIDAS);
    const enLaCiudad = await search.search({ cityId: MARACAIBO });

    expect(counts.cityTotal).toBe(enLaCiudad.length);
    // Los seis de Caracas y los inactivos quedan afuera: el aislamiento no
    // tiene excepción para el vacío.
    expect(counts.cityTotal).toBe(5);
  });

  it("el escalón siguiente de precio se cuenta con los demás filtros puestos", async () => {
    const counts = await facets.countFacets(CRITERIO, ZONAS_OFRECIDAS, {
      minPriceUsd: 100,
      maxPriceUsd: 400,
    });
    const rows = await search.search({ ...CRITERIO, maxPriceUsd: 400 });

    // A2: Centro, dos habitaciones, $300. Entra al ampliar y no antes.
    expect(counts.withWidenedPrice).toBe(rows.length);
    expect(counts.withWidenedPrice).toBe(1);
  });

  it("una zona sin nada dentro del precio no se ofrece por haber salido del WHERE", async () => {
    // El precio dejó de vivir en el `WHERE` compartido para poder contarse
    // soltado, así que ahora llega una fila por cada zona con avisos a
    // cualquier precio. Norte no tiene nada bajo $300 y no es una opción:
    // ofrecerla sería invitar a un vacío (regla 4).
    const counts = await facets.countFacets({ cityId: MARACAIBO, maxPriceUsd: 300 }, [MCBO_CENTRO]);

    expect(counts.byZone).toEqual({ [MCBO_CENTRO]: 2 });
  });

  it("sin preguntar por el escalón siguiente, no hay respuesta que leer", async () => {
    const counts = await facets.countFacets(CRITERIO, ZONAS_OFRECIDAS);

    // Un cero diría "no hay ninguno", que es una respuesta. Esto es silencio.
    expect(counts.withWidenedPrice).toBeUndefined();
  });
});

describe("los criterios nuevos también son facetas (tasks 14.6 a 14.9)", () => {
  /**
   * **Un filtro que llega a la búsqueda y no a las facetas deja los conteos
   * mintiendo.** Y hay una segunda mitad, más sutil: un filtro nuevo que se
   * quedara en el `WHERE` compartido apagaría su propia faceta — todas sus
   * alternativas darían cero y cambiar de opinión parecería imposible.
   */
  it("el conteo de publicador ignora el filtro de publicador", async () => {
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, publisherType: "owner" },
      ZONAS_OFRECIDAS,
    );

    expect(counts.total).toBe(3); // A1, A2, A5
    // Si se filtrara a sí misma, `broker` daría 0 y no habría vuelta atrás.
    expect(counts.byPublisherType).toEqual({ owner: 3, broker: 2 });
    // Y las demás facetas sí respetan el filtro: entre los de dueño hay dos
    // apartamentos y una quinta.
    expect(counts.byPropertyType).toEqual({
      apartamento: 2,
      casa: 0,
      quinta: 1,
      anexo: 0,
      habitacion: 0,
    });
  });

  it("el conteo de tipo de propiedad ignora el filtro de tipo", async () => {
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, propertyType: "apartamento" },
      ZONAS_OFRECIDAS,
    );

    expect(counts.total).toBe(3); // A1, A2, A4
    expect(counts.byPropertyType).toEqual({
      apartamento: 3,
      casa: 1,
      quinta: 1,
      anexo: 0,
      habitacion: 0,
    });
    expect(counts.byPublisherType).toEqual({ owner: 2, broker: 1 });
  });

  it("los conteos de atributo dicen cuántos quedarían si se marcara uno más", async () => {
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, attributes: ["hasPowerPlant"] },
      ZONAS_OFRECIDAS,
    );

    expect(counts.total).toBe(2); // A2 y A4 declaran planta
    expect(counts.byAttribute).toEqual({
      hasPowerPlant: 2,
      hasRegularWater: 1, // sólo A4 declara las dos
      isFurnished: 1, // sólo A2 declara planta y amoblado
      hasSecurity: 0,
      hasAppliances: 0,
    });
  });

  it("dos atributos se exigen con Y, no con O", async () => {
    // **El discriminador.** Con O serían dos avisos (A2 por la planta, A4 por
    // las dos); con Y es uno solo. La diferencia entre las dos lecturas es un
    // inquilino escribiéndole a un apartamento que no tiene agua.
    const criteria: SearchCriteria = {
      cityId: MARACAIBO,
      attributes: ["hasPowerPlant", "hasRegularWater"],
    };
    const [counts, rows] = await Promise.all([
      facets.countFacets(criteria, ZONAS_OFRECIDAS),
      search.search(criteria),
    ]);

    expect(counts.total).toBe(1);
    expect(rows.map((row) => row.id)).toEqual([A4]);
  });

  it("varias zonas se combinan con O, no con Y", async () => {
    // Con Y ninguna fila puede estar en dos zonas a la vez y el total sería 0.
    const counts = await facets.countFacets(
      { cityId: MARACAIBO, zoneIds: [MCBO_CENTRO, MCBO_NORTE] },
      ZONAS_OFRECIDAS,
    );

    expect(counts.total).toBe(5);
    expect(counts.byZone).toEqual({
      [MCBO_CENTRO]: 3,
      [MCBO_NORTE]: 2,
      [MCBO_VACIA]: 0,
    });
  });

  it("ningún criterio nuevo se lleva por delante el aislamiento de ciudad", async () => {
    // D1 es de dueño, apartamento y amoblado: cae dentro de los tres filtros.
    // Una consulta a la que le faltara el predicado de ciudad lo sumaría acá.
    const counts = await facets.countFacets(
      {
        cityId: MARACAIBO,
        publisherType: "owner",
        propertyType: "apartamento",
        attributes: ["isFurnished"],
      },
      ZONAS_OFRECIDAS,
    );

    expect(counts.total).toBe(1); // sólo A2

    const enCaracas = await facets.countFacets({ cityId: DISTRITO, attributes: ["isFurnished"] }, [
      DC_CENTRO,
    ]);

    // A2 y A3 también están amoblados, y son de Maracaibo.
    expect(enCaracas.total).toBe(1);
    expect(enCaracas.byZone).toEqual({ [DC_CENTRO]: 1 });
  });
});

/**
 * **El panel entero contra Postgres real**, que es lo que las dos pantallas de
 * búsqueda dibujan.
 *
 * `buildFilterPanel.test.ts` ya prueba estas reglas contra un doble en
 * memoria, y ese doble cuenta porque fue escrito para contar. Acá se prueba lo
 * que ningún doble puede: que **las zonas que se ofrecen sean las que el conteo
 * nombra** —no la taxonomía entera, que son miles de filas por ciudad— y que
 * **el panel entero cueste un solo viaje de red** (14.50).
 */
const PANEL_ZONAS = [
  { id: MCBO_CENTRO, name: "Centro", slug: "centro", path: "/alquiler/maracaibo/centro" },
  { id: MCBO_NORTE, name: "Norte", slug: "norte", path: "/alquiler/maracaibo/norte" },
  {
    id: MCBO_VACIA,
    name: "Sin avisos",
    slug: "sin-avisos",
    path: "/alquiler/maracaibo/sin-avisos",
  },
] as const;

function panelRequest(overrides: Partial<FilterPanelRequest> = {}): FilterPanelRequest {
  return {
    basePath: "/alquiler/maracaibo",
    cityPath: "/alquiler/maracaibo",
    query: {},
    cityName: "Maracaibo",
    zones: PANEL_ZONAS,
    chosenZoneIds: [],
    criteria: { cityId: MARACAIBO },
    ...overrides,
  };
}

/**
 * **Las tres afirmaciones del conteo por ciudad se borraron con la 14.50, y
 * decirlo acá es la mitad honesta del borrado.** Medían `panel.cities[].count`
 * contra Postgres real —«cada ciudad lleva SU número», «el conteo de la otra
 * ciudad se calcula SIN las zonas de ésta», «los demás filtros SÍ viajan a la
 * otra ciudad»— y las tres eran correctas. El problema no era lo que decían:
 * era que el número que medían **costaba una consulta por ciudad en cada carga
 * de resultados y no llegaba a ningún píxel** desde que la 14.36 sacó el paso
 * de ubicación del panel. Se van con su sujeto, no antes; lo que ocupa su lugar
 * es la cota de viajes de red del final de este archivo.
 */

describe("el panel armado contra la base: las zonas ofrecidas salen del conteo", () => {
  it("se ofrecen las zonas que el conteo nombra, no la taxonomía entera", async () => {
    const { panel, counts } = await buildFilterPanel(facets, panelRequest());

    // La zona curada sin un solo aviso no se ofrece cuando nadie la eligió:
    // ofrecerla sería una opción que lleva a un vacío.
    expect(panel.zones.map((zone) => zone.id)).toEqual([MCBO_CENTRO, MCBO_NORTE]);
    expect(counts.byZone[MCBO_CENTRO]).toBe(3);
    expect(counts.byZone[MCBO_NORTE]).toBe(2);
  });

  it("cada zona ofrecida lleva su número real, y el cero no se dibuja", async () => {
    const { panel } = await buildFilterPanel(facets, panelRequest());

    const centro = panel.zones.find((zone) => zone.id === MCBO_CENTRO);
    const norte = panel.zones.find((zone) => zone.id === MCBO_NORTE);

    expect(centro?.count).toBe(3);
    expect(centro?.countLabel).toBe("3");
    expect(norte?.count).toBe(2);
    expect(centro?.disabled).toBe(false);
  });

  it("la zona elegida se ofrece aunque su conteo sea cero, o quedaría marcada para siempre", async () => {
    const { panel } = await buildFilterPanel(
      facets,
      panelRequest({
        chosenZoneIds: [MCBO_VACIA],
        criteria: { cityId: MARACAIBO, zoneIds: [MCBO_VACIA] },
      }),
    );

    const vacia = panel.zones.find((zone) => zone.id === MCBO_VACIA);

    expect(vacia).toBeDefined();
    expect(vacia?.chosen).toBe(true);
    // El cero existe en el conteo —hace falta para saber que no hay nada— y no
    // se dibuja: un «0» pegado a una opción se lee como un contador roto.
    expect(vacia?.count).toBe(0);
    expect(vacia?.countLabel).toBeNull();
    // Y sigue tocable: si no, no habría forma de soltarla.
    expect(vacia?.disabled).toBe(false);
  });

  it("una zona no se cuenta contra su propio filtro, o cambiar de idea sería imposible", async () => {
    // Con Centro elegido, el número al lado de Norte tiene que decir cuántos
    // habría *si se cambiara*, no cero. Un motor que aplica cada filtro a cada
    // conteo apaga todas las opciones menos la ya elegida.
    const { panel } = await buildFilterPanel(
      facets,
      panelRequest({
        chosenZoneIds: [MCBO_CENTRO],
        criteria: { cityId: MARACAIBO, zoneIds: [MCBO_CENTRO] },
      }),
    );

    expect(panel.zones.find((zone) => zone.id === MCBO_NORTE)?.count).toBe(2);
  });

  it("el botón dice el total de la búsqueda, y es el mismo que devuelve la lista", async () => {
    const criteria: SearchCriteria = { cityId: MARACAIBO, zoneIds: [MCBO_CENTRO, MCBO_NORTE] };
    const [{ panel }, rows] = await Promise.all([
      buildFilterPanel(facets, panelRequest({ criteria, chosenZoneIds: criteria.zoneIds ?? [] })),
      search.search(criteria),
    ]);

    expect(panel.confirm.kind).toBe("results");
    expect(panel.confirm).toMatchObject({ label: `Ver ${rows.length} avisos` });
  });

  it("sin resultados ofrece UNA salida con su número real, traído de la base", async () => {
    // El precio imposible es el filtro que más destraba, y el número que
    // acompaña la oferta lo cuenta Postgres: una salida que promete 5 y
    // entrega 0 manda a otro vacío. La etiqueta lo nombra, que es lo que la
    // pantalla realmente muestra.
    const { panel } = await buildFilterPanel(
      facets,
      panelRequest({
        chosenZoneIds: [MCBO_CENTRO],
        criteria: { cityId: MARACAIBO, zoneIds: [MCBO_CENTRO], minPriceUsd: 100000 },
      }),
    );

    expect(panel.confirm.kind).toBe("empty");
    if (panel.confirm.kind !== "empty") return;

    expect(panel.confirm.relief).not.toBeNull();
    // Soltar el precio deja las tres de Centro; soltar la zona deja cero,
    // porque el precio imposible sigue puesto.
    expect(panel.confirm.relief?.label).toBe("Quitar el precio y ver 3");
    expect(panel.confirm.relief?.resultCount).toBe(3);
  });
});

describe("ninguna pantalla termina en un vacío sin salida (F10 y F11)", () => {
  it("el vacío nombra el filtro que lo causa y ofrece salidas que existen", async () => {
    // La zona curada sin un solo aviso: el vacío no es un accidente de datos,
    // es un filtro concreto y se puede nombrar.
    const { outcome } = await buildFilterPanel(
      facets,
      panelRequest({
        chosenZoneIds: [MCBO_VACIA],
        criteria: { cityId: MARACAIBO, zoneIds: [MCBO_VACIA] },
      }),
    );

    expect(outcome.kind).toBe("empty");
    if (outcome.kind !== "empty") return;

    expect(outcome.cause).toContain("Sin avisos");
    expect(outcome.exits.map((exit) => [exit.kind, exit.resultCount])).toEqual([
      ["drop", 5],
      ["add-zone", 3],
    ]);
    // **Nunca otra ciudad**: toda salida se queda dentro de ésta.
    expect(outcome.exits.every((exit) => exit.href.startsWith("/alquiler/maracaibo"))).toBe(true);
    expect(outcome.exits.some((exit) => exit.href.includes("distrito"))).toBe(false);
  });

  it("y el número que promete cada salida es el que la lista entrega", async () => {
    const { outcome } = await buildFilterPanel(
      facets,
      panelRequest({
        chosenZoneIds: [MCBO_VACIA],
        criteria: { cityId: MARACAIBO, zoneIds: [MCBO_VACIA] },
      }),
    );
    if (outcome.kind !== "empty") throw new Error("se esperaba un vacío");

    const soltarZonas = await search.search({ cityId: MARACAIBO });
    // Sumar Centro a la zona vacía: las zonas se combinan con O.
    const sumarCentro = await search.search({
      cityId: MARACAIBO,
      zoneIds: [MCBO_VACIA, MCBO_CENTRO],
    });

    expect(outcome.exits[0]?.resultCount).toBe(soltarZonas.length);
    expect(outcome.exits[1]?.resultCount).toBe(sumarCentro.length);
  });

  it("con todos los avisos en pantalla, la lista cierra proponiendo un cambio (F10)", async () => {
    const { outcome } = await buildFilterPanel(
      facets,
      panelRequest({ criteria: { cityId: MARACAIBO, minRooms: 2 } }),
    );

    expect(outcome.kind).toBe("complete");
    if (outcome.kind !== "complete") return;

    const conDosOMas = await search.search({ cityId: MARACAIBO, minRooms: 2 });
    const sinHabitaciones = await search.search({ cityId: MARACAIBO });

    expect(outcome.closing).toBe(`Son los ${conDosOMas.length} avisos que coinciden`);
    expect(outcome.exit?.label).toBe(`Quitar las habitaciones y ver ${sinHabitaciones.length}`);
  });
});

/**
 * **El panel entero, contado en viajes de red (14.50, y la 14.11 es la razón).**
 *
 * La 14.11 dejó `queries === 1` afirmado sobre `countFacets`, y esa afirmación
 * es cierta y no alcanza: envuelve **el adaptador**, y quien arma el panel está
 * una capa más arriba. `buildFilterPanel` disparaba un `Promise.all` con una
 * consulta por cada OTRA ciudad para llenar un conteo por ciudad, así que una
 * promesa de un solo viaje viajaba bajo un abanico que nadie contaba — medido
 * el 2026-09-02 con este mismo arnés: **2 viajes con dos ciudades**, N con N.
 *
 * Que la cota esté acá y no sólo abajo es la corrección: se mide **lo que la
 * pantalla pide**, que es lo que se paga. Un abanico sin medir es exactamente
 * cómo éste llegó a existir.
 */
describe("el panel entero cuesta UN viaje de red (14.50)", () => {
  it("arma el panel de una ciudad con dos en el catálogo sin preguntar dos veces", async () => {
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
    const { counts } = await buildFilterPanel(counted, panelRequest());
    await counting.end();

    expect(queries).toBe(1);
    // Y el viaje único trae de verdad los números del panel: sin esta línea la
    // cota de arriba seguiría en verde el día que alguien devuelva un panel
    // vacío sin preguntar nada.
    expect(counts.total).toBe(5);
  });
});
