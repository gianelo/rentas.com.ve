import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DrizzleHomeCollections,
  type HomeCollectionsDatabase,
} from "../../src/modules/listing-discovery/infrastructure/drizzle-home-collections";
import * as schema from "../../src/shared/db/schema";

/**
 * `DrizzleHomeCollections` contra Postgres real.
 *
 * **Lo que sólo la base puede contestar es que el total y las filas salgan del
 * mismo predicado.** Un doble en memoria devolvería los dos números que quien
 * lo escribió esperaba; acá los produce la misma ventana sobre las mismas filas
 * que el `WHERE` dejó pasar, que es la única forma de que "Ver los 23" no
 * termine encima de una página de 21. Lo mismo vale para el `JOIN` contra el
 * `VALUES`, que es lo que hace que un aviso salga en tres colecciones a la vez
 * sin que nadie tenga que acordarse de no deduplicarlo.
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
const db = drizzle(pool, { schema }) as unknown as HomeCollectionsDatabase;
const collections = new DrizzleHomeCollections(db);

const CITY_A = randomUUID();
const CITY_B = randomUUID();
const ZONE_A = randomUUID();
const ZONE_B = randomUUID();
const PUBLISHER = randomUUID();

const LIMIT = 5;

interface Fixture {
  readonly id: string;
  readonly zoneId: string;
  readonly cityId: string;
  readonly priceUsd?: number;
  readonly status?: string;
  /** Días desde hoy hasta el vencimiento. Negativo = ya venció. */
  readonly expiresInDays?: number;
  /** Qué derivadas tiene su portada. Sin portada, la F9 lo descarta. */
  readonly cover?: readonly string[];
  /** Minutos hacia atrás desde ahora. Cuanto menos, más reciente. */
  readonly publishedMinutesAgo?: number;
}

async function insert(fixture: Fixture): Promise<void> {
  const {
    id,
    zoneId,
    cityId,
    priceUsd = 350,
    status = "active",
    expiresInDays = 30,
    cover = ["thumb", "card"],
    publishedMinutesAgo = 60,
  } = fixture;

  await pool.query(
    `INSERT INTO "listing"
       (id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
        price_usd, rooms, area_m2, bathrooms, parking_spots,
        has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
        contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,$5,'Descripción larga.',
             $6,2,65,1,0, false,false,false,false,false,
             'email','sin-contacto',$7,
             now() - ($8 || ' minutes')::interval,
             now() + ($9 || ' days')::interval)`,
    [
      id,
      PUBLISHER,
      cityId,
      zoneId,
      `Apartamento ${id}`,
      priceUsd,
      status,
      String(publishedMinutesAgo),
      String(expiresInDays),
    ],
  );

  if (cover.length === 0) return;

  const photoId = randomUUID();
  await pool.query(
    'INSERT INTO "listing_photo" (id, listing_id, position, created_at) VALUES ($1,$2,0,now())',
    [photoId, id],
  );
  for (const name of cover) {
    await pool.query(
      'INSERT INTO "listing_photo_derivative" (photo_id, name, key, bytes) VALUES ($1,$2,$3,1024)',
      [photoId, name, `photos/${id}/${name}.webp`],
    );
  }
}

/** Los avisos con nombre propio: cada uno prueba una regla distinta. */
const CHEAP = randomUUID();
const IN_CITY_B = randomUUID();
const EXPIRED_STATUS = randomUUID();
const HIDDEN = randomUUID();
const PAST_EXPIRY = randomUUID();
const NO_COVER = randomUUID();
const HALF_COVER = randomUUID();
const NEWEST = randomUUID();

beforeAll(async () => {
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2), ($3,$4)', [
    CITY_A,
    `Ciudad A ${CITY_A}`,
    CITY_B,
    `Ciudad B ${CITY_B}`,
  ]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source)
     VALUES ($1,$2,$3,'parroquia','INE'), ($4,$5,$6,'parroquia','INE')`,
    [ZONE_A, CITY_A, `Zona A ${ZONE_A}`, ZONE_B, CITY_B, `Zona B ${ZONE_B}`],
  );
  await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1,$2,$3)', [
    PUBLISHER,
    "María F.",
    `${PUBLISHER}@rentas.invalid`,
  ]);

  // Seis publicables caros en la ciudad A. Con NEWEST y CHEAP, ocho en total.
  for (let index = 0; index < 6; index += 1) {
    await insert({
      id: randomUUID(),
      zoneId: ZONE_A,
      cityId: CITY_A,
      priceUsd: 900,
      publishedMinutesAgo: 100 + index,
    });
  }
  // El más nuevo de todos, y el único dentro del techo de $400.
  await insert({
    id: NEWEST,
    zoneId: ZONE_A,
    cityId: CITY_A,
    priceUsd: 200,
    publishedMinutesAgo: 1,
  });
  await insert({
    id: CHEAP,
    zoneId: ZONE_A,
    cityId: CITY_A,
    priceUsd: 400,
    publishedMinutesAgo: 2,
  });

  await insert({ id: IN_CITY_B, zoneId: ZONE_B, cityId: CITY_B, priceUsd: 300 });

  // Los cinco que NINGUNA colección puede tocar, ni en las filas ni en el total.
  await insert({ id: EXPIRED_STATUS, zoneId: ZONE_A, cityId: CITY_A, status: "expired" });
  await insert({ id: HIDDEN, zoneId: ZONE_A, cityId: CITY_A, status: "hidden" });
  await insert({ id: PAST_EXPIRY, zoneId: ZONE_A, cityId: CITY_A, expiresInDays: -1 });
  await insert({ id: NO_COVER, zoneId: ZONE_A, cityId: CITY_A, cover: [] });
  await insert({ id: HALF_COVER, zoneId: ZONE_A, cityId: CITY_A, cover: ["thumb"] });
});

afterAll(async () => {
  await pool.query('DELETE FROM "listing" WHERE publisher_id = $1', [PUBLISHER]);
  await pool.query('DELETE FROM "user" WHERE id = $1', [PUBLISHER]);
  await pool.query('DELETE FROM "city" WHERE id = ANY($1)', [[CITY_A, CITY_B]]);
  await pool.end();
});

/** La colección de una ciudad, tal como el dominio la pide. */
function cityRequest(key: string, cityId: string) {
  return { key, cityId, maxPriceUsd: null, limit: LIMIT };
}

describe("collectionsFor — las filas y el total, del mismo predicado", () => {
  /**
   * **La razón de existir del archivo.** Ocho avisos publicables en la ciudad A
   * — seis caros, el más nuevo y el de $400 — y una tira de cinco: el total
   * tiene que decir 8 con cinco filas en la mano. Contarlo aparte es cómo
   * "Ver los 8" termina encima de una página distinta.
   */
  it("recorta a cinco filas y sigue diciendo el total entero", async () => {
    const pages = await collections.collectionsFor([cityRequest("a", CITY_A)]);

    expect(pages.get("a")?.rows).toHaveLength(LIMIT);
    expect(pages.get("a")?.total).toBe(8);
  });

  /**
   * `count(*)` es `bigint` y los drivers de Postgres lo devuelven como
   * **string**. Sin convertirlo, la placa diría "Ver los 8" con un 8 de texto y
   * cualquier comparación contra él fallaría en silencio — el mismo tropiezo
   * que `countWhere` documenta en la búsqueda facetada.
   */
  it("devuelve el total como número y no como el string del bigint", async () => {
    const pages = await collections.collectionsFor([cityRequest("a", CITY_A)]);

    expect(typeof pages.get("a")?.total).toBe("number");
  });

  it("trae lo más nuevo primero", async () => {
    const pages = await collections.collectionsFor([cityRequest("a", CITY_A)]);

    expect(pages.get("a")?.rows[0]?.id).toBe(NEWEST);
    expect(pages.get("a")?.rows[1]?.id).toBe(CHEAP);
  });

  it("resuelve los nombres de ciudad y zona, que es con lo que se arma la ruta", async () => {
    const pages = await collections.collectionsFor([cityRequest("a", CITY_A)]);
    const row = pages.get("a")?.rows[0];

    expect(row?.cityName).toContain("Ciudad A");
    expect(row?.zoneName).toContain("Zona A");
  });
});

describe("collectionsFor — qué queda afuera, de las filas Y del total", () => {
  /**
   * Vencidos, ocultos y sin portada quedan fuera de las dos mitades de la
   * respuesta. Si sólo salieran de las filas, el total los seguiría contando y
   * la placa prometería avisos que no existen en ninguna pantalla.
   */
  it.each([
    ["un aviso vencido por estado", EXPIRED_STATUS],
    ["un aviso oculto por moderación", HIDDEN],
    ["un aviso activo cuya fecha de vencimiento ya pasó", PAST_EXPIRY],
    ["un aviso sin portada", NO_COVER],
    ["un aviso cuya portada perdió una derivada", HALF_COVER],
  ])("no sirve %s", async (_caso, excluded) => {
    // El límite se sube por encima del total para que el recorte no sea el que
    // esconde la fila: lo que la deja fuera tiene que ser el `WHERE`.
    const pages = await collections.collectionsFor([
      { key: "todos", cityId: CITY_A, maxPriceUsd: null, limit: 50 },
    ]);

    expect(pages.get("todos")?.rows.map((row) => row.id)).not.toContain(excluded);
    expect(pages.get("todos")?.total).toBe(8);
  });

  it("una colección sin nada simplemente no está en el mapa", async () => {
    // Una ciudad que no existe: ni una entrada vacía ni un error. Que la tira
    // desaparezca es del dominio, y ausente es como se lo dice.
    const pages = await collections.collectionsFor([cityRequest("vacia", randomUUID())]);

    expect(pages.has("vacia")).toBe(false);
  });
});

describe("collectionsFor — varias colecciones en una consulta", () => {
  /**
   * **El mismo aviso en dos colecciones, y es correcto (14.23).** El aviso más
   * nuevo de la ciudad A cuesta $200: está en su ciudad Y bajo el techo de
   * $400. El `JOIN` contra el `VALUES` lo produce dos veces por construcción,
   * así que no hay ningún lugar donde alguien pueda deduplicarlo por error.
   */
  it("devuelve el mismo aviso en la tira de su ciudad y en la del presupuesto", async () => {
    const pages = await collections.collectionsFor([
      cityRequest("ciudad", CITY_A),
      { key: "presupuesto", cityId: null, maxPriceUsd: 400, limit: LIMIT },
    ]);

    expect(pages.get("ciudad")?.rows.map((row) => row.id)).toContain(NEWEST);
    expect(pages.get("presupuesto")?.rows.map((row) => row.id)).toContain(NEWEST);
  });

  /**
   * El techo es inclusivo: un aviso de exactamente $400 entra en "hasta $400".
   * Es el borde donde un `<` se disfraza de `<=`, y del lado equivocado la tira
   * pierde justo los avisos que su título nombra.
   */
  it("incluye el aviso que cuesta exactamente el techo", async () => {
    const pages = await collections.collectionsFor([
      { key: "presupuesto", cityId: null, maxPriceUsd: 400, limit: 50 },
    ]);

    expect(pages.get("presupuesto")?.rows.map((row) => row.id)).toContain(CHEAP);
  });

  /**
   * La colección sin ciudad cruza las dos, que es lo que la F1 pide de la tira
   * barata. Un `cityId` nulo tratado como filtro dejaría la tira siempre vacía.
   */
  it("la colección sin ciudad ve las dos ciudades", async () => {
    const pages = await collections.collectionsFor([
      { key: "presupuesto", cityId: null, maxPriceUsd: 400, limit: 50 },
    ]);
    const ids = pages.get("presupuesto")?.rows.map((row) => row.id) ?? [];

    expect(ids).toContain(NEWEST);
    expect(ids).toContain(IN_CITY_B);
  });

  it("cada colección lleva su propio total, no el de la consulta entera", async () => {
    const pages = await collections.collectionsFor([
      cityRequest("ciudad-a", CITY_A),
      cityRequest("ciudad-b", CITY_B),
    ]);

    expect(pages.get("ciudad-a")?.total).toBe(8);
    expect(pages.get("ciudad-b")?.total).toBe(1);
  });

  it("sin colecciones no consulta nada", async () => {
    expect((await collections.collectionsFor([])).size).toBe(0);
  });
});
