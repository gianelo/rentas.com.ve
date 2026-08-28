import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RESULTS_PER_PAGE,
  resolvePagination,
} from "../../src/modules/listing-search/domain/pagination";
import {
  DrizzleListingSearch,
  type SearchDatabase,
} from "../../src/modules/listing-search/infrastructure/drizzle-listing-search";
import * as schema from "../../src/shared/db/schema";

/**
 * Tasks 5.3/5.5 — city isolation and the active-only rule, against real
 * Postgres. An in-memory fake would filter because it was written to; this
 * proves the SQL does. Isolation is the guarantee the whole product rests
 * on (design.md D5), and its failure mode is silent: a Caracas flat in a
 * Maracaibo search looks like a result, not like a bug.
 *
 * **Y las tasks 14.6 a 14.10**, que son las que traen predicados nuevos: el O
 * de varias zonas, el Y de los atributos, el tipo, el publicador y la ventana
 * de paginación. Cada una tiene acá una fila que la contradice — un aviso que
 * entraría si el predicado se escribiera al revés — porque una consulta que
 * filtra de más y una que filtra de menos se ven igual desde afuera cuando la
 * base sólo tiene ejemplos que confirman.
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
const db = drizzle(pool, { schema }) as unknown as SearchDatabase;
const search = new DrizzleListingSearch(db);

const MARACAIBO = randomUUID();
const DISTRITO = randomUUID();
/** Both cities have a "Centro" — the colliding-name case task 5.3 names. */
const MCBO_CENTRO = randomUUID();
const MCBO_NORTE = randomUUID();
const DC_CENTRO = randomUUID();
const ANA = randomUUID();

const MCBO_ACTIVE = randomUUID();
const MCBO_BIG = randomUUID();
const MCBO_EXPIRED = randomUUID();
const MCBO_HIDDEN = randomUUID();
const DC_ACTIVE = randomUUID();

/**
 * Una tercera ciudad sólo para los filtros de las tasks 14.6 a 14.9, para que
 * agregar variedad de tipos y atributos no le cambie los números a las
 * aserciones de arriba.
 */
const FILTROS = randomUUID();
const F_UNO = randomUUID();
const F_DOS = randomUUID();
const F_TRES = randomUUID();
const F_A = randomUUID();
const F_B = randomUUID();
const F_C = randomUUID();
const F_D = randomUUID();
/** Declara los cinco atributos y está vencido: ningún filtro puede alcanzarlo. */
const F_VENCIDO = randomUUID();

/** Y una cuarta con más avisos que una página, para la 14.10. */
const PAGINADA = randomUUID();
const P_ZONA = randomUUID();
const PAGINADOS = RESULTS_PER_PAGE + 2;

/**
 * Una quinta ciudad para la 21.1, con DOS avisos idénticos salvo la fecha.
 *
 * Van en su propia ciudad a propósito: el par vigente/vencido es la aserción
 * entera, y así ninguna de las dos filas puede cambiarle un número a las de
 * arriba. La única diferencia entre ellos es `expires_at`, así que una
 * consulta que devolviera los dos —o ninguno— no puede pasar por casualidad.
 */
const RELOJ = randomUUID();
const R_ZONA = randomUUID();
const R_VIGENTE = randomUUID();
const R_VENCIDO_POR_RELOJ = randomUUID();

interface Fixture {
  readonly id: string;
  readonly zoneId: string;
  readonly cityId: string;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly areaM2: number;
  readonly status: string;
  readonly title?: string;
  readonly propertyType?: string;
  readonly publisherType?: string;
  readonly hasPowerPlant?: boolean;
  readonly hasRegularWater?: boolean;
  readonly isFurnished?: boolean;
  readonly hasSecurity?: boolean;
  readonly hasAppliances?: boolean;
  /**
   * Minutos de antigüedad. Sin esto, todas las filas comparten un `now()` con
   * la misma resolución y el orden de la lista sale de la suerte — que es
   * justo lo que la paginación no puede tolerar: `OFFSET` corta sobre un
   * orden, y si ese orden cambia entre dos consultas, la página 2 repite un
   * aviso y se salta otro.
   */
  readonly ageMinutes?: number;
  /**
   * Minutos de vigencia **contados desde `now()` de Postgres**, no una fecha.
   *
   * Que sea un desplazamiento y no un literal es la parte que importa: una
   * fixture con `'2026-01-01'` escrito a mano cambia de significado sola el
   * día que el calendario la pasa, y la prueba sigue verde midiendo otra
   * cosa. Negativo = ya vencido; el valor por defecto son los 30 días que
   * `activate` le pone a un aviso recién publicado.
   */
  readonly expiresInMinutes?: number;
}

const THIRTY_DAYS_IN_MINUTES = 30 * 24 * 60;

async function insertListing(fixture: Fixture) {
  await pool.query(
    `INSERT INTO "listing" (id, publisher_id, publisher_type, property_type, city_id, zone_id, title,
       description, price_usd, rooms, area_m2, bathrooms,
       has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
       contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'x',$8,$9,$10,2,
       $11,$12,$13,$14,$15,
       'whatsapp','04121234567',$16,
       now() - make_interval(mins => $17::int), now() + make_interval(mins => $18::int))`,
    [
      fixture.id,
      ANA,
      fixture.publisherType ?? "owner",
      fixture.propertyType ?? "apartamento",
      fixture.cityId,
      fixture.zoneId,
      fixture.title ?? "Apartamento",
      fixture.priceUsd,
      fixture.rooms,
      fixture.areaM2,
      fixture.hasPowerPlant ?? false,
      fixture.hasRegularWater ?? false,
      fixture.isFurnished ?? false,
      fixture.hasSecurity ?? false,
      fixture.hasAppliances ?? false,
      fixture.status,
      fixture.ageMinutes ?? 0,
      fixture.expiresInMinutes ?? THIRTY_DAYS_IN_MINUTES,
    ],
  );
}

beforeAll(async () => {
  for (const [city, name] of [
    [MARACAIBO, "Maracaibo"],
    [DISTRITO, "Distrito Capital"],
    [FILTROS, "Filtros"],
    [PAGINADA, "Paginada"],
    [RELOJ, "Reloj"],
  ] as const) {
    await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [city, `${name} ${city}`]);
  }
  for (const [zone, city, name] of [
    [MCBO_CENTRO, MARACAIBO, "Centro"],
    [MCBO_NORTE, MARACAIBO, "Norte"],
    [DC_CENTRO, DISTRITO, "Centro"],
    [F_UNO, FILTROS, "Uno"],
    [F_DOS, FILTROS, "Dos"],
    [F_TRES, FILTROS, "Tres"],
    [P_ZONA, PAGINADA, "Única"],
    [R_ZONA, RELOJ, "Única"],
  ] as const) {
    await pool.query(
      `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
      [zone, city, name],
    );
  }
  await pool.query(`INSERT INTO "user" (id, email) VALUES ($1,$2)`, [ANA, `ana-${ANA}@ej.com`]);

  await insertListing({
    id: MCBO_ACTIVE,
    zoneId: MCBO_CENTRO,
    cityId: MARACAIBO,
    priceUsd: 320,
    rooms: 2,
    areaM2: 74,
    status: "active",
  });
  await insertListing({
    id: MCBO_BIG,
    zoneId: MCBO_NORTE,
    cityId: MARACAIBO,
    priceUsd: 900,
    rooms: 3,
    areaM2: 120,
    status: "active",
    publisherType: "broker",
  });
  await insertListing({
    id: MCBO_EXPIRED,
    zoneId: MCBO_CENTRO,
    cityId: MARACAIBO,
    priceUsd: 300,
    rooms: 2,
    areaM2: 70,
    status: "expired",
  });
  await insertListing({
    id: MCBO_HIDDEN,
    zoneId: MCBO_CENTRO,
    cityId: MARACAIBO,
    priceUsd: 310,
    rooms: 2,
    areaM2: 71,
    status: "hidden",
  });
  await insertListing({
    id: DC_ACTIVE,
    zoneId: DC_CENTRO,
    cityId: DISTRITO,
    priceUsd: 350,
    rooms: 2,
    areaM2: 70,
    status: "active",
  });

  await insertListing({
    id: F_A,
    zoneId: F_UNO,
    cityId: FILTROS,
    priceUsd: 100,
    rooms: 1,
    areaM2: 40,
    status: "active",
    publisherType: "owner",
    propertyType: "apartamento",
    hasPowerPlant: true,
  });
  await insertListing({
    id: F_B,
    zoneId: F_DOS,
    cityId: FILTROS,
    priceUsd: 200,
    rooms: 2,
    areaM2: 50,
    status: "active",
    publisherType: "broker",
    propertyType: "casa",
    hasPowerPlant: true,
    hasRegularWater: true,
  });
  await insertListing({
    id: F_C,
    zoneId: F_TRES,
    cityId: FILTROS,
    priceUsd: 300,
    rooms: 3,
    areaM2: 60,
    status: "active",
    publisherType: "owner",
    propertyType: "quinta",
  });
  await insertListing({
    id: F_D,
    zoneId: F_UNO,
    cityId: FILTROS,
    priceUsd: 400,
    rooms: 4,
    areaM2: 70,
    status: "active",
    publisherType: "broker",
    propertyType: "apartamento",
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: true,
    hasSecurity: true,
    hasAppliances: true,
  });
  await insertListing({
    id: F_VENCIDO,
    zoneId: F_UNO,
    cityId: FILTROS,
    priceUsd: 400,
    rooms: 4,
    areaM2: 70,
    status: "expired",
    publisherType: "owner",
    propertyType: "apartamento",
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: true,
    hasSecurity: true,
    hasAppliances: true,
  });

  for (let index = 0; index < PAGINADOS; index += 1) {
    await insertListing({
      id: randomUUID(),
      zoneId: P_ZONA,
      cityId: PAGINADA,
      priceUsd: 100 + index,
      rooms: 2,
      areaM2: 50,
      status: "active",
      // Índice ascendente = más viejo, y el orden es del más nuevo al más
      // viejo, así que la página 1 son los títulos 00 a 23 en orden.
      title: `Aviso ${String(index).padStart(2, "0")}`,
      ageMinutes: index,
    });
  }

  // task 21.1. Los dos son `active` y sólo se diferencian en la fecha.
  for (const [id, expiresInMinutes] of [
    [R_VIGENTE, 24 * 60],
    [R_VENCIDO_POR_RELOJ, -60],
  ] as const) {
    await insertListing({
      id,
      zoneId: R_ZONA,
      cityId: RELOJ,
      priceUsd: 250,
      rooms: 2,
      areaM2: 55,
      status: "active",
      publisherType: "owner",
      propertyType: "apartamento",
      expiresInMinutes,
    });
  }
});

afterAll(async () => {
  await pool.query(`DELETE FROM "user" WHERE id = $1`, [ANA]);
  await pool.query(`DELETE FROM "city" WHERE id = ANY($1)`, [
    [MARACAIBO, DISTRITO, FILTROS, PAGINADA, RELOJ],
  ]);
  await pool.end();
});

describe("city isolation (D5, task 5.3)", () => {
  it("returns no Distrito Capital listing for a Maracaibo search with no other filter", async () => {
    const results = await search.search({ cityId: MARACAIBO });

    expect(results.map((r) => r.id).sort()).toEqual([MCBO_ACTIVE, MCBO_BIG].sort());
    expect(results.every((r) => r.cityId === MARACAIBO)).toBe(true);
  });

  it("holds across a price range wide enough to include the Caracas listing", async () => {
    // DC_ACTIVE costs 350, squarely inside this range. A query missing its
    // city predicate would return it here and nowhere else.
    const results = await search.search({ cityId: MARACAIBO, minPriceUsd: 0, maxPriceUsd: 100000 });

    expect(results.map((r) => r.id)).not.toContain(DC_ACTIVE);
  });

  it("holds when the zone name collides across cities", async () => {
    // Two zones named "Centro". Filtering by the Maracaibo one must not
    // reach the Caracas one — the ids differ, and the id is what is asked
    // for, but a query that joined or matched on name would not know that.
    const results = await search.search({ cityId: MARACAIBO, zoneIds: [MCBO_CENTRO] });

    expect(results.map((r) => r.id)).toEqual([MCBO_ACTIVE]);
  });

  it("holds when the zone list itself carries another city's zone", async () => {
    // `buildSearchCriteria` deja caer una zona ajena antes de llegar acá, pero
    // el puerto no puede apoyarse en eso: la ciudad está en el `AND` de
    // afuera, así que la lista de zonas sólo puede acotar, nunca ampliar.
    const results = await search.search({
      cityId: FILTROS,
      zoneIds: [F_UNO, MCBO_CENTRO, DC_CENTRO],
    });

    expect(results.map((r) => r.id).sort()).toEqual([F_A, F_D].sort());
  });
});

describe("active only (tasks 5.5/5.6)", () => {
  it("excludes expired and auto-hidden listings that would otherwise match", async () => {
    // Same city, same zone, same price band as MCBO_ACTIVE: status is the
    // only reason these two are absent.
    const results = await search.search({ cityId: MARACAIBO, zoneIds: [MCBO_CENTRO] });
    const ids = results.map((r) => r.id);

    expect(ids).not.toContain(MCBO_EXPIRED);
    expect(ids).not.toContain(MCBO_HIDDEN);
  });

  it("sigue fuera del alcance del filtro más específico posible", async () => {
    // F_VENCIDO declara los cinco atributos, es apartamento y es de dueño: la
    // búsqueda más estrecha que se puede escribir lo describe exactamente.
    const results = await search.search({
      cityId: FILTROS,
      publisherType: "owner",
      propertyType: "apartamento",
      attributes: [
        "hasPowerPlant",
        "hasRegularWater",
        "isFurnished",
        "hasSecurity",
        "hasAppliances",
      ],
    });

    expect(results).toEqual([]);
  });
});

describe("vigente son DOS condiciones, no una (task 21.1)", () => {
  /**
   * **La ventana está medida, no supuesta.** `vercel.json` agenda
   * `/api/jobs/expiry-reminders` con `0 13 * * *` —una vez al día—,
   * `markExpired` corre adentro de ese trabajo con `WHERE status = 'active'
   * AND expires_at < now()`, y nada más mueve el rótulo. Como un aviso vence
   * a los 30 días de la HORA en que se publicó, entre «vencido por reloj» y
   * «vencido en la base» hay de 0 a casi 24 horas. En ese hueco la fila
   * todavía dice `active`.
   *
   * Es la misma regla que el sitemap escribió en la 11.13 —«el filtro de
   * frescura son dos condiciones, no una»— aplicada a la pantalla más
   * visitada del producto. Lo que se evita es concreto: un inquilino le
   * escribe a un aviso que ya no está, que es el mensaje desperdiciado del
   * que habla la 5.5.
   */
  it("la fixture es realmente el caso: rótulo `active` y fecha ya pasada", async () => {
    // Sin esto la prueba de abajo podría estar verde por el motivo
    // equivocado —una fila `expired`, o una fecha que nunca pasó—, y nadie
    // se enteraría. El desplazamiento se calcula contra el `now()` de
    // Postgres en cada corrida, así que no puede envejecer hasta cambiar de
    // significado.
    const { rows } = await pool.query<{ status: string; vencido: boolean }>(
      `SELECT status, expires_at < now() AS vencido FROM "listing" WHERE id = ANY($1) ORDER BY id`,
      [[R_VENCIDO_POR_RELOJ]],
    );

    expect(rows[0]).toEqual({ status: "active", vencido: true });
  });

  it("no devuelve el aviso cuya fecha ya pasó, aunque su rótulo siga diciendo active", async () => {
    const results = await search.search({ cityId: RELOJ });

    // **El discriminador.** Los dos avisos son iguales en todo salvo
    // `expires_at`: el vigente tiene que venir y el vencido no. Una consulta
    // que ignorara el reloj traería los dos; una que se pasara de estricta no
    // traería ninguno. Sólo el filtro correcto da esta lista de uno.
    expect(results.map((row) => row.id)).toEqual([R_VIGENTE]);
  });

  it("sigue fuera del alcance del filtro más específico que lo describe", async () => {
    // Mismo idioma que la 5.5 con `F_VENCIDO`: la búsqueda más estrecha que
    // se puede escribir sobre esa fila tampoco la alcanza.
    const results = await search.search({
      cityId: RELOJ,
      zoneIds: [R_ZONA],
      propertyType: "apartamento",
      publisherType: "owner",
      minPriceUsd: 250,
      maxPriceUsd: 250,
      minRooms: 2,
      minAreaM2: 55,
    });

    expect(results.map((row) => row.id)).toEqual([R_VIGENTE]);
  });
});

describe("price and characteristics (task 5.4)", () => {
  it("narrows by price range", async () => {
    expect((await search.search({ cityId: MARACAIBO, maxPriceUsd: 500 })).map((r) => r.id)).toEqual(
      [MCBO_ACTIVE],
    );
    expect((await search.search({ cityId: MARACAIBO, minPriceUsd: 500 })).map((r) => r.id)).toEqual(
      [MCBO_BIG],
    );
  });

  it("narrows by rooms and area, and carries publisher_type per result", async () => {
    const results = await search.search({ cityId: MARACAIBO, minRooms: 3, minAreaM2: 100 });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: MCBO_BIG, publisherType: "broker", areaM2: 120 });
  });
});

describe("varias zonas, combinadas con O (task 14.6, F4)", () => {
  it("trae los avisos de todas las zonas pedidas", async () => {
    // **El discriminador.** Con Y ninguna fila puede estar en dos zonas a la
    // vez y esto daría cero; con O son tres.
    const results = await search.search({ cityId: FILTROS, zoneIds: [F_UNO, F_DOS] });

    expect(results.map((r) => r.id).sort()).toEqual([F_A, F_B, F_D].sort());
  });

  it("una zona sola sigue siendo una lista de una", async () => {
    const results = await search.search({ cityId: FILTROS, zoneIds: [F_TRES] });

    expect(results.map((r) => r.id)).toEqual([F_C]);
  });

  it("las zonas acotan de verdad: la que no se pidió no aparece", async () => {
    const results = await search.search({ cityId: FILTROS, zoneIds: [F_DOS, F_TRES] });

    expect(results.map((r) => r.id).sort()).toEqual([F_B, F_C].sort());
  });
});

describe("tipo de publicador y tipo de propiedad (tasks 14.7 y 14.8)", () => {
  it("trae sólo los de dueño (F6)", async () => {
    const results = await search.search({ cityId: FILTROS, publisherType: "owner" });

    expect(results.map((r) => r.id).sort()).toEqual([F_A, F_C].sort());
    expect(results.every((r) => r.publisherType === "owner")).toBe(true);
  });

  it("trae sólo los de inmobiliaria cuando eso es lo que se pide", async () => {
    const results = await search.search({ cityId: FILTROS, publisherType: "broker" });

    expect(results.map((r) => r.id).sort()).toEqual([F_B, F_D].sort());
  });

  it("filtra por tipo de propiedad", async () => {
    expect(
      (await search.search({ cityId: FILTROS, propertyType: "apartamento" }))
        .map((r) => r.id)
        .sort(),
    ).toEqual([F_A, F_D].sort());
    expect(
      (await search.search({ cityId: FILTROS, propertyType: "casa" })).map((r) => r.id),
    ).toEqual([F_B]);
    expect(await search.search({ cityId: FILTROS, propertyType: "anexo" })).toEqual([]);
  });

  it("combina los dos con el resto, siempre con Y", async () => {
    const results = await search.search({
      cityId: FILTROS,
      publisherType: "broker",
      propertyType: "apartamento",
    });

    expect(results.map((r) => r.id)).toEqual([F_D]);
  });
});

describe("los atributos declarados, combinados con Y (task 14.9)", () => {
  it("trae los que declararon el atributo pedido", async () => {
    const results = await search.search({ cityId: FILTROS, attributes: ["hasPowerPlant"] });

    expect(results.map((r) => r.id).sort()).toEqual([F_A, F_B, F_D].sort());
  });

  it("exige TODOS los pedidos, no cualquiera de ellos", async () => {
    // **El discriminador.** Con O serían tres (F_A por la planta, F_B y F_D
    // por las dos); con Y son dos. La diferencia entre las dos lecturas es un
    // inquilino escribiéndole a un apartamento que no tiene agua.
    const results = await search.search({
      cityId: FILTROS,
      attributes: ["hasPowerPlant", "hasRegularWater"],
    });

    expect(results.map((r) => r.id).sort()).toEqual([F_B, F_D].sort());
  });

  it("los cinco a la vez dejan sólo al que declaró los cinco", async () => {
    const results = await search.search({
      cityId: FILTROS,
      attributes: [
        "hasPowerPlant",
        "hasRegularWater",
        "isFurnished",
        "hasSecurity",
        "hasAppliances",
      ],
    });

    expect(results.map((r) => r.id)).toEqual([F_D]);
  });

  it("no hay forma de pedir el que NO lo declaró", async () => {
    // No es un caso de borde: es la forma del tipo. `attributes` es una lista
    // de atributos exigidos, así que no existe un valor que signifique
    // "los que dijeron que no" — y no existe porque en estas columnas `false`
    // significa "no lo declaró", no "no lo tiene". Lo único observable es que
    // pedir el atributo nunca devuelve a quien no lo declaró.
    const results = await search.search({ cityId: FILTROS, attributes: ["isFurnished"] });

    expect(results.map((r) => r.id)).toEqual([F_D]);
    expect(results.map((r) => r.id)).not.toContain(F_C);
  });
});

describe("paginación (task 14.10, F10)", () => {
  it("nunca devuelve más de una página, aunque la ciudad tenga más", async () => {
    const results = await search.search({ cityId: PAGINADA });

    // Antes de la 14.10 esta consulta devolvía el catálogo entero.
    expect(PAGINADOS).toBeGreaterThan(RESULTS_PER_PAGE);
    expect(results).toHaveLength(RESULTS_PER_PAGE);
  });

  it("la segunda página trae el resto y no repite nada de la primera", async () => {
    const [primera, segunda] = await Promise.all([
      search.search({ cityId: PAGINADA }),
      search.search({ cityId: PAGINADA, page: 2 }),
    ]);

    expect(segunda).toHaveLength(PAGINADOS - RESULTS_PER_PAGE);

    const ids = [...primera, ...segunda].map((row) => row.id);
    // Ni un aviso repetido ni uno perdido: el orden total (fecha, y el id
    // como desempate) es lo que hace que `OFFSET` corte siempre igual.
    expect(new Set(ids).size).toBe(PAGINADOS);
  });

  it("las páginas salen en orden, de la más nueva a la más vieja", async () => {
    const primera = await search.search({ cityId: PAGINADA });
    const segunda = await search.search({ cityId: PAGINADA, page: 2 });

    expect(primera[0]?.title).toBe("Aviso 00");
    expect(primera[RESULTS_PER_PAGE - 1]?.title).toBe(
      `Aviso ${String(RESULTS_PER_PAGE - 1).padStart(2, "0")}`,
    );
    expect(segunda[0]?.title).toBe(`Aviso ${String(RESULTS_PER_PAGE).padStart(2, "0")}`);
  });

  it("una página más allá del final devuelve vacío en vez de romperse", async () => {
    // El enlace viejo pegado en un chat. La respuesta honesta es una lista
    // vacía, no un error de Postgres ni una página 500.
    expect(await search.search({ cityId: PAGINADA, page: 400 })).toEqual([]);
  });

  it("la ventana se aplica también sobre una búsqueda filtrada", async () => {
    const results = await search.search({ cityId: PAGINADA, zoneIds: [P_ZONA], minRooms: 2 });

    expect(results).toHaveLength(RESULTS_PER_PAGE);
  });

  it("no se lleva por delante el aislamiento de ciudad", async () => {
    // La ciudad paginada tiene más de una página; Maracaibo tiene dos avisos.
    // Un `LIMIT` que se aplicara antes del `WHERE` mezclaría las dos.
    const results = await search.search({ cityId: MARACAIBO, page: 2 });

    expect(results).toEqual([]);
  });
});

describe("la placa de la ciudad y sus páginas, atadas (F3 + F10)", () => {
  /**
   * **El bug que la pantalla de ciudad tuvo publicado.** `pageWindow` recorta
   * a 24 por su cuenta, sin que la pantalla lo pida, y esa pantalla no ofrecía
   * ni un enlace: el aviso 25 en adelante existía, se contaba en la placa «Ver
   * los N», y no había forma de llegar. Nada fallaba — se dibujaba perfecta
   * con las primeras 24.
   *
   * Se prueba acá y no en un test de pantalla porque la relación es entre dos
   * cosas del motor: **cuántos hay** y **cuántos alcanza la paginación**. Si
   * las dos no cierran, la placa promete avisos que nadie puede abrir.
   */
  it("recorriendo todas las páginas se llega a todos los avisos, sin repetir ni perder", async () => {
    const paginacion = resolvePagination(undefined, PAGINADOS);

    // Guarda: con una sola página este test no probaría nada y pasaría por eso.
    expect(paginacion.count).toBeGreaterThan(1);

    const ids = new Set<string>();
    for (let page = 1; page <= paginacion.count; page += 1) {
      const rows = await search.search({
        cityId: PAGINADA,
        // La primera página es la ausencia del parámetro, igual que en la URL.
        ...(page === 1 ? {} : { page }),
      });
      for (const row of rows) ids.add(row.id);
    }

    expect(ids.size).toBe(PAGINADOS);
  });

  it("la última página no queda vacía: no se cuenta una página de más", async () => {
    // Una página final vacía es la forma amable del mismo bug: el enlace
    // existe, lleva a una cuadrícula sin nada, y no hay causa visible.
    const ultima = resolvePagination(undefined, PAGINADOS).count;

    expect(await search.search({ cityId: PAGINADA, page: ultima })).not.toHaveLength(0);
  });

  it("una página más allá del final se dice, no se dibuja vacía", async () => {
    // Es el enlace viejo pegado en un chat: la búsqueda existe y tiene menos
    // páginas que la última vez. `beyondEnd` es lo que deja decirlo, y
    // `current` recortado es adónde ofrecer volver.
    const paginacion = resolvePagination(400, PAGINADOS);

    expect(paginacion.beyondEnd).toBe(true);
    expect(paginacion.current).toBe(paginacion.count);
    expect(await search.search({ cityId: PAGINADA, page: 400 })).toEqual([]);
    expect(await search.search({ cityId: PAGINADA, page: paginacion.current })).not.toHaveLength(0);
  });

  it("el conteo de una ciudad no se lo lleva la ventana de otra", async () => {
    // La placa de cada ciudad es una consulta propia — el puerto exige una
    // ciudad por consulta, que es la garantía de aislamiento del D5. Maracaibo
    // entra entera en una página; la paginada no.
    const maracaibo = await search.search({ cityId: MARACAIBO });
    const paginada = await search.search({ cityId: PAGINADA });

    expect(maracaibo.length).toBeLessThan(RESULTS_PER_PAGE);
    expect(paginada).toHaveLength(RESULTS_PER_PAGE);

    const deMaracaibo = new Set(maracaibo.map((row) => row.id));
    for (const row of paginada) expect(deMaracaibo.has(row.id)).toBe(false);
  });
});
