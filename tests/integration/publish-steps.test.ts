import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  resolveZoneCity,
  searchPublicationZones,
} from "../../src/modules/listing-publication/domain/zone-search";
import type { PublicationDatabase } from "../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { DrizzleZoneVocabulary } from "../../src/modules/listing-publication/infrastructure/drizzle-zone-vocabulary";
import * as schema from "../../src/shared/db/schema";

/**
 * `DrizzleZoneVocabulary` contra Postgres real — el buscador de zona del paso 2.
 *
 * **Este adaptador tiene dos cosas que ningún doble puede contestar**, y son
 * las que decidieron que este archivo existiera:
 *
 * 1. **El auto-join a `zone` por `parent_id`.** Sólo la base dice si el join
 *    trae el municipio correcto y —lo que importa más— si una zona SIN padre
 *    sigue apareciendo. Ésa es la diferencia entre `leftJoin` e `innerJoin`, y
 *    un doble escrito a mano nunca la tiene: filtra como lo escribió quien lo
 *    escribió.
 * 2. **`= ANY()` sobre el arreglo de zonas que sólo un alias trajo.** El tipo
 *    del parámetro lo resuelve el motor, no TypeScript; y el arreglo vacío es
 *    una consulta distinta a la del arreglo lleno.
 *
 * El resto de la búsqueda —qué se ofrece, en qué orden y con qué etiqueta— es
 * `searchPublicationZones`, que es pura y está cubierta sin base. Acá se prueba
 * únicamente lo que el SQL decide, y una vez el par completo: el vocabulario
 * real entrando al dominio real.
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
const db = drizzle(pool, { schema }) as unknown as PublicationDatabase;
const vocabulary = new DrizzleZoneVocabulary(db);

/**
 * Un marcador irrepetible dentro de cada nombre de fixture.
 *
 * `lookup` consulta la tabla ENTERA con `ILIKE`, así que buscar por "Altamira"
 * traería también lo que dejó otro archivo de esta misma suite. Buscando por el
 * marcador, el conjunto de resultados es exactamente el de estas fixtures.
 */
function marker(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Está en el nombre de casi todas las fixtures: es "buscá lo mío y nada más". */
const TOKEN = marker();
/** Sólo en un nombre, y en ningún alias: fuerza el camino del arreglo vacío. */
const SOLO = marker();
/** En ningún nombre y en ningún alias: fuerza el camino del catálogo vacío. */
const NADA = marker();
/** Sólo en el alias de una zona, nunca en su nombre: fuerza el `= ANY()`. */
const OCULTO = marker();

const CITY_A = randomUUID();
const CITY_B = randomUUID();
const MUNICIPIO_A = randomUUID();
const ALTAMIRA_A = randomUUID();
const MUNICIPIO_B = randomUUID();
const ALTAMIRA_B = randomUUID();
const POSTAL_A = randomUUID();
const SOLO_A = randomUUID();
const PORCENTAJE_A = randomUUID();
const KILOMETRO_A = randomUUID();

const CITY_A_NAME = `Ciudad A ${CITY_A}`;
const CITY_B_NAME = `Ciudad B ${CITY_B}`;
const MUNICIPIO_A_NAME = `Chacao ${TOKEN}`;
const MUNICIPIO_B_NAME = `Maracaibo ${TOKEN}`;
/** El mismo nombre en dos ciudades: así se repite `Buena Vista` 12 veces. */
const ALTAMIRA_NAME = `Altamira ${TOKEN}`;
const POSTAL_A_NAME = `Oficina Postal Telegráfica Bella Vista ${OCULTO}`;
const POSTAL_A_ALIAS = `Bella Vista ${TOKEN}`;
const SOLO_A_NAME = `Solo Nombre ${SOLO}`;
const PORCENTAJE_A_NAME = `Sector 100% ${TOKEN}`;
const KILOMETRO_A_NAME = `Kilometro 1001 ${TOKEN}`;

async function insertZone(
  id: string,
  cityId: string,
  parentId: string | null,
  name: string,
  kind: string,
  category: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO "zone" (id, city_id, parent_id, name, kind, category, source)
     VALUES ($1,$2,$3,$4,$5,$6,'IPOSTEL')`,
    [id, cityId, parentId, name, kind, category],
  );
}

beforeAll(async () => {
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2), ($3,$4)', [
    CITY_A,
    CITY_A_NAME,
    CITY_B,
    CITY_B_NAME,
  ]);

  // Sin padre, a propósito: es la fila que un `innerJoin` haría desaparecer.
  await insertZone(MUNICIPIO_A, CITY_A, null, MUNICIPIO_A_NAME, "municipio", null);
  await insertZone(MUNICIPIO_B, CITY_B, null, MUNICIPIO_B_NAME, "municipio", null);

  await insertZone(ALTAMIRA_A, CITY_A, MUNICIPIO_A, ALTAMIRA_NAME, "elemento", "urbanizacion");
  await insertZone(ALTAMIRA_B, CITY_B, MUNICIPIO_B, ALTAMIRA_NAME, "elemento", "urbanizacion");

  await insertZone(POSTAL_A, CITY_A, MUNICIPIO_A, POSTAL_A_NAME, "elemento", "sector");
  await insertZone(SOLO_A, CITY_A, MUNICIPIO_A, SOLO_A_NAME, "elemento", "barrio");
  await insertZone(PORCENTAJE_A, CITY_A, MUNICIPIO_A, PORCENTAJE_A_NAME, "elemento", "comunidad");
  await insertZone(KILOMETRO_A, CITY_A, MUNICIPIO_A, KILOMETRO_A_NAME, "elemento", "caserio");

  await pool.query('INSERT INTO "zone_alias" (zone_id, alias) VALUES ($1,$2)', [
    POSTAL_A,
    POSTAL_A_ALIAS,
  ]);
});

afterAll(async () => {
  // `zone` y `zone_alias` caen por cascada al borrar la ciudad.
  await pool.query('DELETE FROM "city" WHERE id = ANY($1)', [[CITY_A, CITY_B]]);
  await pool.end();
});

describe("DrizzleZoneVocabulary.lookup", () => {
  /**
   * **El auto-join trae el padre.** Sin él la lista del paso 2 ofrece dos
   * "Altamira" idénticas y quien publica elige una al azar; el municipio es lo
   * único que las separa.
   */
  it("trae el nombre del municipio padre de cada zona", async () => {
    const found = await vocabulary.lookup(TOKEN);

    expect(found.zones).toContainEqual({
      id: ALTAMIRA_A,
      name: ALTAMIRA_NAME,
      cityId: CITY_A,
      parentName: MUNICIPIO_A_NAME,
    });
  });

  /**
   * **La razón por la que el join es `left` y no `inner`.** Los municipios están
   * arriba del árbol y no tienen padre. Con un `inner`, un municipio entero
   * desaparecería del buscador sin que nada fallara: la consulta seguiría
   * devolviendo filas, sólo que ninguna de las que más se escriben.
   */
  it("devuelve una zona sin padre en vez de descartarla", async () => {
    const found = await vocabulary.lookup(TOKEN);

    expect(found.zones).toContainEqual({
      id: MUNICIPIO_A,
      name: MUNICIPIO_A_NAME,
      cityId: CITY_A,
      parentName: null,
    });
  });

  /**
   * **El `= ANY()` con el arreglo lleno.** `Bella Vista` no está en el nombre
   * publicado —IPOSTEL lo entierra dentro de "Oficina Postal Telegráfica…"— así
   * que esta zona llega SÓLO por su alias, en la segunda consulta. Si ese
   * `= ANY()` fallara, el alias devolvería una sugerencia que el dominio
   * descarta después por no conocer su zona, y el buscador quedaría mudo justo
   * para los topónimos por los que la gente busca.
   */
  it("recupera por id la zona que sólo un alias encontró, con su padre", async () => {
    const found = await vocabulary.lookup(TOKEN);

    expect(POSTAL_A_NAME).not.toContain(TOKEN);
    expect(found.aliases).toContainEqual({ zoneId: POSTAL_A, alias: POSTAL_A_ALIAS });
    expect(found.zones).toContainEqual({
      id: POSTAL_A,
      name: POSTAL_A_NAME,
      cityId: CITY_A,
      parentName: MUNICIPIO_A_NAME,
    });
  });

  /**
   * **El arreglo vacío no llega a ser una consulta.** Cuando ningún alias
   * coincide, no hay zona que recuperar por id: la guarda es lo que evita
   * emitir `= ANY($1)` con un arreglo sin tipo, que es la forma en que esta
   * consulta se rompe. Se prueba por el resultado y no por el plan, porque lo
   * que le importa a quien publica es que el buscador conteste.
   */
  it("contesta sin romperse cuando ningún alias coincide", async () => {
    const found = await vocabulary.lookup(SOLO);

    expect(found.aliases).toEqual([]);
    expect(found.zones).toEqual([
      { id: SOLO_A, name: SOLO_A_NAME, cityId: CITY_A, parentName: MUNICIPIO_A_NAME },
    ]);
  });

  /** Ni zonas ni alias: el catálogo entero vacío tampoco es un error. */
  it("devuelve listas vacías cuando no coincide nada", async () => {
    const found = await vocabulary.lookup(NADA);

    expect(found.zones).toEqual([]);
    expect(found.aliases).toEqual([]);
    // Las ciudades se piden igual: el dominio necesita conocerlas para decidir.
    expect(found.cities).toContainEqual({ id: CITY_A, name: CITY_A_NAME });
  });

  /**
   * **La búsqueda por id, que es como el paso 2 resuelve la zona ya elegida.**
   * `readPublicationContext` llama a `lookup(zoneId)` para poder mostrar un
   * nombre en vez de un uuid. Ningún nombre contiene ese uuid, así que sin el
   * `eq(zones.id, raw)` la pantalla de revisar diría la zona en crudo.
   */
  it("encuentra una zona por su id aunque ningún nombre lo contenga", async () => {
    const found = await vocabulary.lookup(ALTAMIRA_B);

    expect(found.zones).toEqual([
      { id: ALTAMIRA_B, name: ALTAMIRA_NAME, cityId: CITY_B, parentName: MUNICIPIO_B_NAME },
    ]);
  });

  /**
   * **`%` es un comodín de `LIKE`, y sin escaparlo "100%" significa "traeme
   * todo".** Eso no es un resultado de más: son miles de filas por tecla desde
   * una función sin servidor, que es exactamente lo que el puerto acotado
   * existe para no hacer.
   */
  it("trata el comodín como texto y no como comodín", async () => {
    const found = await vocabulary.lookup("100%");

    const names = found.zones.map((zone) => zone.name);
    expect(names).toContain(PORCENTAJE_A_NAME);
    // Contiene "100", no "100%": con el comodín suelto entraría igual.
    expect(names).not.toContain(KILOMETRO_A_NAME);
  });
});

/**
 * El vocabulario real entrando al dominio real. Cada mitad está probada por su
 * cuenta; esto prueba que encajan — que las columnas que la consulta elige son
 * las que `searchPublicationZones` lee.
 */
describe("el vocabulario real contra el buscador del paso 2", () => {
  /**
   * **La ciudad la determina la zona (criterio de aceptación 7).** Dos zonas
   * homónimas en ciudades distintas tienen que llegar con SU ciudad: si la
   * consulta las mezclara, el paso 2 guardaría el par equivocado y la clave
   * foránea compuesta de `listing` rechazaría la publicación al final de los
   * nueve pasos, sin nada que explicar.
   */
  it("sostiene el aislamiento de ciudad entre dos zonas homónimas", async () => {
    const found = await vocabulary.lookup(TOKEN);
    const options = searchPublicationZones(TOKEN, found);

    const homonyms = options.filter((option) => option.label === ALTAMIRA_NAME);
    expect(homonyms).toHaveLength(2);

    const inA = homonyms.find((option) => option.zoneId === ALTAMIRA_A);
    const inB = homonyms.find((option) => option.zoneId === ALTAMIRA_B);

    expect(inA?.cityId).toBe(CITY_A);
    expect(inB?.cityId).toBe(CITY_B);
    // El municipio y la ciudad: es lo único que las distingue en pantalla.
    expect(inA?.scope).toBe(`${MUNICIPIO_A_NAME} · ${CITY_A_NAME}`);
    expect(inB?.scope).toBe(`${MUNICIPIO_B_NAME} · ${CITY_B_NAME}`);
  });

  /**
   * **Una zona de otra ciudad no se ofrece como si fuera de ésta.** Resolver la
   * ciudad desde la zona elegida es lo que hace que "la ciudad nunca se
   * pregunta" sea cierto; devolver la ciudad equivocada sería publicar el aviso
   * en otra ciudad sin que quien publica lo hubiera pedido nunca.
   */
  it("resuelve cada zona a su propia ciudad, nunca a la otra", async () => {
    const found = await vocabulary.lookup(ALTAMIRA_B);

    expect(resolveZoneCity(ALTAMIRA_B, found)).toEqual({
      zoneId: ALTAMIRA_B,
      cityId: CITY_B,
    });
    // `lookup` por id devuelve una sola zona: la de la otra ciudad no viaja.
    expect(resolveZoneCity(ALTAMIRA_A, found)).toBeNull();
  });
});
