import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ActiveZonesDatabase,
  DrizzleActiveZones,
} from "../../src/modules/listing-discovery/infrastructure/drizzle-active-zones";
import * as schema from "../../src/shared/db/schema";

/**
 * `DrizzleActiveZones` contra Postgres de verdad (tasks.md 14.52).
 *
 * **Lo que sólo una base puede contestar, y por eso esto no es una prueba
 * unitaria.** El vocabulario del inicio es un `GROUP BY` sobre avisos vivos
 * unido a su zona y a su parroquia: si el predicado se escribe de más, la
 * portada ofrece una zona que la búsqueda de destino encuentra vacía; si se
 * escribe de menos, ofrece una zona con avisos vencidos adentro. Las dos fallan
 * **en silencio** — la sugerencia aparece, se ve bien, y la pantalla a la que
 * lleva no tiene nada. Un doble en memoria filtraría porque lo escribieron para
 * filtrar; esto prueba que lo hace el SQL.
 *
 * **El aislamiento de ciudad, que es la garantía dura del producto (D5), acá se
 * ve al revés que en la búsqueda.** `listing-search.test.ts` prueba que una
 * consulta de Maracaibo no trae un aviso de Distrito Capital. Este puerto cruza
 * las dos ciudades a propósito —en `/` no hay ciudad elegida—, así que lo que
 * hay que probar es que **cada fila se queda con su ciudad y con su conteo**: un
 * `GROUP BY` que agrupara por nombre en vez de por zona fundiría los dos
 * «Centro» en una sola sugerencia con la suma de los dos, y esa sugerencia
 * llevaría a una de las dos ciudades prometiendo los avisos de la otra.
 *
 * Cada regla tiene acá una fila que la contradice: un vencido, un oculto y una
 * zona sin nada. Una base que sólo trae ejemplos que confirman no distingue una
 * consulta que filtra de una que no filtra.
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
const db = drizzle(pool, { schema }) as unknown as ActiveZonesDatabase;
const activeZones = new DrizzleActiveZones(db);

/**
 * Dos ciudades propias de este archivo, porque la base es una sola y la
 * comparten todos los archivos de integración. Este puerto **no recibe ciudad**,
 * así que devuelve también las zonas de los demás: las aserciones se hacen
 * siempre sobre estos ids y nunca sobre el largo de la lista entera.
 */
const NORTE = randomUUID();
const SUR = randomUUID();
const ANA = randomUUID();

/** La parroquia que desambigua, y que llega por el auto-join del adaptador. */
const NORTE_PARROQUIA = randomUUID();
/** El mismo nombre en las dos ciudades: el caso que un `GROUP BY` mal escrito funde. */
const NORTE_CENTRO = randomUUID();
const SUR_CENTRO = randomUUID();
/** Sin parroquia declarada: `parentName` tiene que salir nulo y no romperse. */
const NORTE_HUERFANA = randomUUID();
/** Sin un solo aviso vivo: no puede aparecer, ni siquiera en cero. */
const NORTE_VACIA = randomUUID();

const THIRTY_DAYS_IN_MINUTES = 30 * 24 * 60;

interface Fixture {
  readonly zoneId: string;
  readonly cityId: string;
  readonly status: string;
  /**
   * Minutos de vigencia contados desde el `now()` de Postgres, nunca una fecha
   * escrita a mano: un literal cambia de significado solo el día que el
   * calendario lo pasa, y la prueba sigue verde midiendo otra cosa. Negativo =
   * ya vencido.
   */
  readonly expiresInMinutes?: number;
}

async function insertListing(fixture: Fixture) {
  await pool.query(
    `INSERT INTO "listing" (id, publisher_id, publisher_type, property_type, city_id, zone_id, title,
       description, price_usd, rooms, area_m2, bathrooms,
       contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,'Apartamento','x',300,2,70,2,
       'whatsapp','04121234567',$5, now(), now() + make_interval(mins => $6::int))`,
    [
      randomUUID(),
      ANA,
      fixture.cityId,
      fixture.zoneId,
      fixture.status,
      fixture.expiresInMinutes ?? THIRTY_DAYS_IN_MINUTES,
    ],
  );
}

beforeAll(async () => {
  await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2),($3,$4)`, [
    NORTE,
    `Norte ${NORTE}`,
    SUR,
    `Sur ${SUR}`,
  ]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [NORTE_PARROQUIA, NORTE, `Chacao ${NORTE_PARROQUIA}`],
  );
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source, parent_id)
     VALUES ($1,$2,'Centro','urbanizacion','INE',$3),
            ($4,$5,'Centro','urbanizacion','INE',NULL),
            ($6,$7,'Huérfana','urbanizacion','INE',NULL),
            ($8,$9,'Vacía','urbanizacion','INE',NULL)`,
    [
      NORTE_CENTRO,
      NORTE,
      NORTE_PARROQUIA,
      SUR_CENTRO,
      SUR,
      NORTE_HUERFANA,
      NORTE,
      NORTE_VACIA,
      NORTE,
    ],
  );
  await pool.query(`INSERT INTO "user" (id, email) VALUES ($1,$2)`, [ANA, `ana-${ANA}@ej.com`]);

  // Tres vivos en el Centro del norte, uno en el del sur: los dos conteos son
  // distintos a propósito, así que una suma de los dos grupos no puede pasar
  // por casualidad ni coincidir con ninguno de ellos.
  await insertListing({ zoneId: NORTE_CENTRO, cityId: NORTE, status: "active" });
  await insertListing({ zoneId: NORTE_CENTRO, cityId: NORTE, status: "active" });
  await insertListing({ zoneId: NORTE_CENTRO, cityId: NORTE, status: "active" });
  await insertListing({ zoneId: SUR_CENTRO, cityId: SUR, status: "active" });

  // Uno vivo en la huérfana, que es la que prueba el `left join` de la parroquia.
  await insertListing({ zoneId: NORTE_HUERFANA, cityId: NORTE, status: "active" });

  // Las tres filas que contradicen el predicado, todas en la zona vacía: si
  // alguna contara, esa zona aparecería — y aparecer es exactamente lo que no
  // puede hacer.
  await insertListing({ zoneId: NORTE_VACIA, cityId: NORTE, status: "expired" });
  await insertListing({ zoneId: NORTE_VACIA, cityId: NORTE, status: "hidden" });
  await insertListing({
    zoneId: NORTE_VACIA,
    cityId: NORTE,
    status: "active",
    expiresInMinutes: -1,
  });
});

afterAll(async () => {
  await pool.end();
});

/** Sólo las filas de este archivo: la base la comparten todos los de integración. */
async function ours() {
  const rows = await activeZones.listActiveZones();
  return rows.filter((zone) => zone.cityId === NORTE || zone.cityId === SUR);
}

describe("DrizzleActiveZones contra Postgres", () => {
  it("cada ciudad se queda con su «Centro» y con su propio conteo", async () => {
    const rows = await ours();

    expect(rows.find((zone) => zone.id === NORTE_CENTRO)).toMatchObject({
      name: "Centro",
      cityId: NORTE,
      count: 3,
    });
    expect(rows.find((zone) => zone.id === SUR_CENTRO)).toMatchObject({
      name: "Centro",
      cityId: SUR,
      count: 1,
    });
  });

  /**
   * La positiva de la negativa de abajo: sin ésta, un adaptador que devolviera
   * la lista vacía pasaría todas las pruebas de ausencia.
   */
  it("la zona con avisos vivos está, y la que no tiene ninguno no aparece ni en cero", async () => {
    const rows = await ours();

    expect(rows.map((zone) => zone.id)).toContain(NORTE_HUERFANA);
    expect(rows.map((zone) => zone.id)).not.toContain(NORTE_VACIA);
  });

  /**
   * Los tres avisos de la zona vacía son un vencido por estado, uno oculto y uno
   * vigente de estado pero vencido **por reloj** — que es el que sólo cae con
   * `expires_at > now()` en la consulta y no con `status = 'active'`.
   */
  it("ni vencidos, ni ocultos, ni vigentes con la fecha pasada", async () => {
    const rows = await ours();

    expect(rows.some((zone) => zone.id === NORTE_VACIA)).toBe(false);
  });

  it("la parroquia llega resuelta, y sin parroquia el campo es nulo y no vacío", async () => {
    const rows = await ours();

    expect(rows.find((zone) => zone.id === NORTE_CENTRO)?.parentName).toBe(
      `Chacao ${NORTE_PARROQUIA}`,
    );
    expect(rows.find((zone) => zone.id === NORTE_HUERFANA)?.parentName).toBeNull();
  });

  /**
   * **`count(*)` es `bigint`, y los drivers de Postgres lo devuelven como
   * string.** Sin la conversión, la sugerencia diría «3» con un 3 de texto y
   * cualquier comparación numérica sobre él mentiría en silencio — es el mismo
   * tropiezo que `countWhere` documenta en la búsqueda facetada. `toBe(3)` no lo
   * atrapa solo: `expect("3").toBe(3)` falla, pero el tipo declarado ya dice
   * `number`, así que se comprueba lo que llegó en ejecución.
   */
  it("el conteo llega como número y no como el string del bigint", async () => {
    const rows = await ours();

    expect(typeof rows.find((zone) => zone.id === NORTE_CENTRO)?.count).toBe("number");
  });
});
