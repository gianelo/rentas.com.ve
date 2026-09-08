import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { slugify } from "../../src/modules/listing-discovery/domain/listing-url";
import type { SmokeDatabase } from "../../src/modules/operability/infrastructure/schema-shapes";
import {
  backfillTaxonomySlugs,
  findTaxonomySlugGapsIn,
} from "../../src/modules/operability/infrastructure/taxonomy-slug-backfill";
import { type SeedDatabase, seed, seedTaxonomy } from "../../src/shared/db/seed";
import { withPoolCleanup } from "./support/pool-cleanup";

/**
 * **`city.slug` y `zone.slug` son nullable a propósito** (tasks.md 27.1,
 * slice A) — la migración sólo pudo AGREGAR la columna, nunca llenarla, ver
 * `schema.ts`. Esto es el arnés que prueba, contra Postgres real y la
 * taxonomía real (no una copia), las dos mitades que hacen esa decisión
 * segura: que sembrar escribe el slug correcto desde el día uno, y que el
 * backfill cierra cualquier fila vieja que haya llegado sin uno.
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

interface SlugRow {
  readonly name: string;
  readonly slug: string | null;
}

const client = new Client({ connectionString: getTestDatabaseUrl() });
const database = drizzle(client);

describe("el slug de la taxonomía", () => {
  beforeAll(async () => {
    await client.connect();
    // Pizarra limpia y el mismo orden que `seed-taxonomy.test.ts`: `listing`
    // referencia a `zone` y a `city`.
    await client.query('DELETE FROM "listing"');
    await client.query('DELETE FROM "zone"');
    await client.query('DELETE FROM "city"');
    await seedTaxonomy(database as unknown as SeedDatabase);
  }, 120_000);

  afterAll(async () => {
    await withPoolCleanup(client, async () => {
      // Deja la base como la encontró cualquier otra suite: comparte el
      // contenedor con las demás.
      await seed(database as unknown as SeedDatabase);
    });
  }, 120_000);

  it("la siembra deja cada ciudad y cada zona con slug = slugify(name), sin necesitar backfill", async () => {
    expect(await findTaxonomySlugGapsIn(database as unknown as SmokeDatabase)).toStrictEqual([]);

    const cityRows = (await client.query('SELECT name, slug FROM "city"')).rows as SlugRow[];
    const zoneRows = (await client.query('SELECT name, slug FROM "zone"')).rows as SlugRow[];

    // La taxonomía real tiene cinco áreas y 5.796 zonas (seed-taxonomy.test.ts);
    // afirmarlo acá de nuevo asegura que esta prueba mira las mismas filas y
    // no una taxonomía provisional vacía que pasaría por no tener nada mal.
    expect(cityRows.length).toBe(5);
    expect(zoneRows.length).toBe(5796);

    for (const row of [...cityRows, ...zoneRows]) {
      expect(row.slug).toBe(slugify(row.name));
      expect(row.slug).not.toBe("");
    }
  }, 120_000);

  it("el backfill llena TODAS las filas que llegan con slug NULL, y con el valor correcto", async () => {
    // Simula el estado de un despliegue migrado ANTES de esta rebanada: la
    // columna existe, y ninguna fila la tiene todavía.
    await client.query('UPDATE "city" SET slug = NULL');
    await client.query('UPDATE "zone" SET slug = NULL');

    const result = await backfillTaxonomySlugs(database as unknown as SmokeDatabase);

    expect(result).toStrictEqual({ citiesBackfilled: 5, zonesBackfilled: 5796 });
    expect(await findTaxonomySlugGapsIn(database as unknown as SmokeDatabase)).toStrictEqual([]);
  }, 120_000);

  /**
   * **El caso que hacía irreparable a una fila, y bloqueaba todo despliegue
   * futuro** (hallazgo `R4-backfill-gate-asymmetry` de la revisión).
   *
   * La reparación miraba sólo `slug IS NULL` mientras el gate rechazaba
   * además el slug viejo. Una fila con slug no nulo y desactualizado no la
   * tocaba nadie y la reportaba siempre, y el `process.exit(1)` de
   * `taxonomy-smoke.ts` tumbaba ese despliegue y todos los siguientes. El
   * disparador real es una edición de `slugify`, que dejaría viejas las 5.813
   * filas de una sola vez.
   */
  it("el backfill también reescribe el slug viejo, no sólo el NULL", async () => {
    await client.query(`UPDATE "city" SET slug = 'quedo-de-una-corrida-anterior'`);
    // Y la cadena vacía, que no es NULL y el tipo de la columna acepta igual.
    // Las filas se eligen por id y no por nombre: qué zonas trae
    // `docs/territorio/` es un dato del contenido, y una prueba que lo fija
    // se cae la próxima vez que alguien resiembre.
    await client.query(
      `UPDATE "zone" SET slug = '' WHERE id IN (SELECT id FROM "zone" ORDER BY id LIMIT 3)`,
    );

    const result = await backfillTaxonomySlugs(database as unknown as SmokeDatabase);

    expect(result.citiesBackfilled).toBe(5);
    expect(result.zonesBackfilled).toBe(3);
    expect(await findTaxonomySlugGapsIn(database as unknown as SmokeDatabase)).toStrictEqual([]);
  }, 120_000);

  it("el backfill es un no-op cuando ninguna fila está mal", async () => {
    const result = await backfillTaxonomySlugs(database as unknown as SmokeDatabase);
    expect(result).toStrictEqual({ citiesBackfilled: 0, zonesBackfilled: 0 });
  });
});
