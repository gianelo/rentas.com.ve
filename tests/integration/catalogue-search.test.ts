import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveSearchDestination } from "../../src/modules/listing-catalogue/domain/search-destination";
import type { CatalogueDatabase } from "../../src/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { DrizzleSearchVocabulary } from "../../src/modules/listing-catalogue/infrastructure/drizzle-search-vocabulary";
import { slugify } from "../../src/modules/listing-discovery/domain/listing-url";
import * as schema from "../../src/shared/db/schema";

/**
 * `DrizzleSearchVocabulary` + `resolveSearchDestination` contra Postgres real.
 *
 * **Qué vale la pena probar acá, y qué no.** La traducción de texto a destino
 * es pura y ya está cubierta por unidad; repetirla a través de una base no
 * probaría nada nuevo y sería más lenta al hacerlo. Lo que sólo Postgres puede
 * contestar es la costura: si el `ILIKE` sobre `zone_alias` encuentra la fila,
 * si la segunda consulta trae la zona que **sólo** el alias nombró, y si el
 * `LEFT JOIN` contra el padre entrega el `parentName` que desambigua.
 *
 * Esa segunda consulta es la razón de que este archivo exista. «Bella Vista»
 * es exactamente el caso para el que la tabla de alias fue creada: el nombre
 * publicado es otro, así que la búsqueda por nombre no la trae, y sin el
 * rescate por id la sugerencia se cae después en el dominio por no conocer su
 * ciudad. Un doble en memoria nunca vería esa costura.
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
const vocabulary = new DrizzleSearchVocabulary(db);

// Sufijos aleatorios porque `city.name` es UNIQUE y esta suite comparte una
// sola base con todos los demás archivos de integración.
const CITY = randomUUID();
const CITY_NAME = `Zuliana ${CITY}`;
const PARISH = randomUUID();
const PARISH_NAME = `Olegario ${PARISH}`;
const ZONE = randomUUID();
// **Ni una palabra en común entre el nombre y el alias, y eso ES el test.**
// La primera versión los sufijaba con el mismo id, así que el `ILIKE` por
// nombre ya traía la zona y la consulta de rescate nunca corría: el archivo
// pasaba con esa consulta borrada. Lo encontró una mutación, no una lectura.
const ZONE_NAME = `Oficina Postal Telegrafica ${randomUUID()}`;
// El nombre por el que la gente busca, que vive sólo en `zone_alias`.
const ZONE_ALIAS = `Bellavistona ${randomUUID()}`;

beforeAll(async () => {
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2)', [CITY, CITY_NAME]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, parent_id, name, kind, source)
     VALUES ($1,$2,NULL,$3,'parroquia','INE'),($4,$5,$1,$6,'urbanizacion','INE')`,
    [PARISH, CITY, PARISH_NAME, ZONE, CITY, ZONE_NAME],
  );
  await pool.query('INSERT INTO "zone_alias" (zone_id, alias) VALUES ($1,$2)', [ZONE, ZONE_ALIAS]);
});

afterAll(async () => {
  // Las zonas y sus alias se van con la ciudad: las dos claves foráneas son
  // ON DELETE cascade, que es la misma garantía en la que se apoya el adaptador.
  await pool.query('DELETE FROM "city" WHERE id = $1', [CITY]);
  await pool.end();
});

describe("DrizzleSearchVocabulary.lookup", () => {
  /**
   * **La costura entera, punta a punta.** El alias vive en otra tabla que el
   * nombre publicado; encontrarlo obliga a la segunda consulta que rescata la
   * zona por id. Sin ella el dominio recibe un alias huérfano y lo descarta.
   */
  it("encuentra por alias la zona que su nombre publicado esconde", async () => {
    const found = await vocabulary.lookup(ZONE_ALIAS);

    expect(found.aliases.some((row) => row.zoneId === ZONE)).toBe(true);
    // La fila de la zona tiene que llegar aunque el `ILIKE` por nombre no la
    // trajera: es lo único que le da su ciudad y su padre.
    const zone = found.zones.find((row) => row.id === ZONE);
    expect(zone).toBeDefined();
    expect(zone?.cityId).toBe(CITY);
    expect(zone?.parentName).toBe(PARISH_NAME);
  });

  it("no trae la taxonomía entera cuando no hay nada que buscar", async () => {
    const found = await vocabulary.lookup("   ");

    expect(found.zones).toEqual([]);
    expect(found.aliases).toEqual([]);
    // Las ciudades sí van siempre: son dos filas, y son lo que el dominio
    // ofrece cuando alguien escribió filtros sin nombrar un lugar.
    expect(found.cities.some((city) => city.id === CITY)).toBe(true);
  });

  /**
   * `%` y `_` son comodines de `LIKE`. Sin escaparlos, esto traería todo.
   */
  it("escapa los comodines de LIKE", async () => {
    const found = await vocabulary.lookup("%%");

    expect(found.zones).toEqual([]);
  });
});

describe("el buscador del inicio, contra filas reales", () => {
  /**
   * **La mutación que importa**: la dirección se arma con el NOMBRE CURADO,
   * nunca con el alias. Un slug hecho del alias produciría
   * `/alquiler/<ciudad>/bellavistona-…`, que `resolveZoneRoute` no resuelve
   * porque compara contra `slugify(zone.name)` — un 404 con aspecto de enlace.
   */
  it("traduce un alias a la ruta de la zona que la ruta sí resuelve", async () => {
    const found = await vocabulary.lookup(ZONE_ALIAS);
    const destination = resolveSearchDestination(ZONE_ALIAS, found);

    expect(destination.kind).toBe("route");
    if (destination.kind !== "route") throw new Error("debía resolver a una ruta");

    // Se reusa `slugify` y no se reescribe: es exactamente la función contra la
    // que `resolveZoneRoute` compara, y una segunda copia acá probaría que el
    // destino coincide con mi copia en vez de con la ruta que se sirve.
    expect(destination.href).toBe(`/alquiler/${slugify(CITY_NAME)}/${slugify(ZONE_NAME)}`);
    expect(destination.href).not.toContain(slugify(ZONE_ALIAS));
  });

  /**
   * **Sin JavaScript el mecanismo es éste**: lo escrito llega por `?q=` y el
   * servidor devuelve una dirección canónica con los filtros pegados. Nada de
   * esto necesita que el navegador ejecute nada.
   */
  it("pega a la ruta los filtros que la misma frase trae", async () => {
    const text = `apartamento amoblado en ${ZONE_ALIAS} hasta 400`;
    const found = await vocabulary.lookup(text);
    const destination = resolveSearchDestination(text, found);

    expect(destination.kind).toBe("route");
    if (destination.kind !== "route") throw new Error("debía resolver a una ruta");
    expect(destination.href).toContain("tipo=apartamento");
    expect(destination.href).toContain("amoblado=1");
    expect(destination.href).toContain("max=400");
  });
});
