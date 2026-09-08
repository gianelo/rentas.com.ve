import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type CatalogueDatabase,
  DrizzleCatalogue,
} from "../../src/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import * as schema from "../../src/shared/db/schema";

/**
 * `DrizzleCatalogue.listActiveZones` contra Postgres de verdad (tasks.md
 * 27.1, slice C).
 *
 * **La misma disciplina que `active-zones.test.ts`, con la ciudad como
 * argumento en vez de las dos a la vez.** El panel de filtros y
 * `boundedVocabularyOf` tienen que recibir sólo las zonas de SU ciudad con
 * avisos vivos: un `GROUP BY` mal recortado ofrecería una zona sin avisos —
 * pantalla sin salida, regla transversal 4 — o dejaría cruzar una zona de la
 * ciudad vecina, que es el mismo aislamiento que D5 exige del lado de la
 * búsqueda.
 *
 * **Medido contra este mismo contenedor** (`rentas_test`, la siembra real de
 * 17 ciudades / 5.810 zonas), antes de escribir la consulta: `listCities()` +
 * `listZones()` — lo que el panel y las sugerencias pagaban antes de esta
 * rebanada para armar el vocabulario de UNA sola ciudad — devuelven 5.827
 * filas y ~1.211 KB (`pg_column_size`, `city.*` + `zone.*`). La consulta de
 * abajo, para Caracas (avisos reales sembrados), devuelve **6 filas y ~688
 * bytes**, con un `GroupAggregate` sobre las filas que el `WHERE` ya recortó
 * — confirmado con `EXPLAIN ANALYZE` y no supuesto.
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
const db = drizzle(pool, { schema }) as unknown as CatalogueDatabase;
const catalogue = new DrizzleCatalogue(db);

const NORTE = randomUUID();
const SUR = randomUUID();
const ANA = randomUUID();

const NORTE_PARROQUIA = randomUUID();
/** El mismo nombre en las dos ciudades: el caso que un `GROUP BY` sin `city_id` fundiría. */
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
  /** Minutos desde el `now()` de Postgres, nunca una fecha escrita a mano. */
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

  await insertListing({ zoneId: NORTE_CENTRO, cityId: NORTE, status: "active" });
  await insertListing({ zoneId: NORTE_CENTRO, cityId: NORTE, status: "active" });
  await insertListing({ zoneId: NORTE_CENTRO, cityId: NORTE, status: "active" });
  await insertListing({ zoneId: SUR_CENTRO, cityId: SUR, status: "active" });
  await insertListing({ zoneId: NORTE_HUERFANA, cityId: NORTE, status: "active" });

  // Las tres filas que contradicen el predicado, todas en la zona vacía: si
  // alguna contara, esa zona aparecería — y aparecer es lo que no puede hacer.
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
  // `listing.city_id` es `ON DELETE restrict` (a diferencia de `zone`, que
  // cae en cascada): sin borrar los avisos primero, la base rechaza el
  // `DELETE` de la ciudad.
  await pool.query('DELETE FROM "listing" WHERE publisher_id = $1', [ANA]);
  await pool.query('DELETE FROM "user" WHERE id = $1', [ANA]);
  await pool.query('DELETE FROM "city" WHERE id = ANY($1)', [[NORTE, SUR]]);
  await pool.end();
});

describe("DrizzleCatalogue.listActiveZones", () => {
  it("sólo trae las zonas de LA CIUDAD pedida, nunca la vecina que comparte nombre", async () => {
    const rows = await catalogue.listActiveZones(NORTE);

    expect(rows.map((zone) => zone.id)).toContain(NORTE_CENTRO);
    expect(rows.map((zone) => zone.id)).not.toContain(SUR_CENTRO);
  });

  it("cada ciudad ve su propio conteo del mismo nombre", async () => {
    const [norte, sur] = await Promise.all([
      catalogue.listActiveZones(NORTE),
      catalogue.listActiveZones(SUR),
    ]);

    expect(norte.find((zone) => zone.id === NORTE_CENTRO)).toMatchObject({
      name: "Centro",
      cityId: NORTE,
      count: 3,
    });
    expect(sur.find((zone) => zone.id === SUR_CENTRO)).toMatchObject({
      name: "Centro",
      cityId: SUR,
      count: 1,
    });
  });

  it("la zona con avisos vivos está, y la que no tiene ninguno no aparece ni en cero", async () => {
    const rows = await catalogue.listActiveZones(NORTE);

    expect(rows.map((zone) => zone.id)).toContain(NORTE_HUERFANA);
    expect(rows.map((zone) => zone.id)).not.toContain(NORTE_VACIA);
  });

  it("la parroquia llega resuelta, y sin parroquia el campo es nulo y no vacío", async () => {
    const rows = await catalogue.listActiveZones(NORTE);

    expect(rows.find((zone) => zone.id === NORTE_CENTRO)?.parentName).toBe(
      `Chacao ${NORTE_PARROQUIA}`,
    );
    expect(rows.find((zone) => zone.id === NORTE_HUERFANA)?.parentName).toBeNull();
  });

  /**
   * `count(*)` es `bigint` y los drivers de Postgres lo devuelven como
   * string; sin `mapWith(Number)` la sugerencia diría «3» de texto y
   * cualquier comparación numérica mentiría en silencio.
   */
  it("el conteo llega como número y no como el string del bigint", async () => {
    const rows = await catalogue.listActiveZones(NORTE);

    expect(typeof rows.find((zone) => zone.id === NORTE_CENTRO)?.count).toBe("number");
  });
});
