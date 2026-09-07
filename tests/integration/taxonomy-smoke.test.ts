import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SmokeDatabase } from "../../src/modules/operability/infrastructure/schema-shapes";
import { findTaxonomyGapsIn } from "../../src/modules/operability/infrastructure/taxonomy-census";
import { type SeedDatabase, seed } from "../../src/shared/db/seed";
import { withPoolCleanup } from "./support/pool-cleanup";

/**
 * **El chequeo de humo de la taxonomía (17.15), contra Postgres real.**
 *
 * `schema-smoke` pregunta si están las columnas; nadie preguntaba nunca si
 * están las FILAS. Producción llegó con 10 zonas provisionales bajo una ciudad
 * llamada «Distrito Capital» en vez de las 5.796 que `docs/territorio/`
 * define, y el paso 2 de publicar quedó sin una sola zona que ofrecer — con
 * la suite entera en verde, porque ninguna afirmación miraba el contenido del
 * entorno real.
 *
 * Como en `schema-smoke.test.ts`, el defecto se **construye** en vez de
 * afirmarse: primero la base provisional, y que el chequeo la rechaza;
 * después la taxonomía que el seed deja de verdad, y que la acepta. Una sola
 * de las dos mitades no probaría nada.
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

const client = new Client({ connectionString: getTestDatabaseUrl() });
const database = drizzle(client);

/**
 * La forma exacta que el fundador encontró el 2026-09-05: una ciudad que la
 * taxonomía no nombra y un puñado de municipios sueltos colgando de ella.
 */
const PROVISIONAL_CITY = { id: "provisional-distrito-capital", name: "Distrito Capital" };
const PROVISIONAL_ZONES = ["Chacao", "Baruta", "El Hatillo"];

describe("el chequeo de humo de la taxonomía", () => {
  beforeAll(async () => {
    await client.connect();
    // Pizarra limpia, y el mismo orden que `seed.test.ts` por la misma razón:
    // `listing` referencia a `zone` y a `city`.
    await client.query('DELETE FROM "listing"');
    await client.query('DELETE FROM "zone"');
    await client.query('DELETE FROM "city"');
    await client.query('INSERT INTO "city" (id, name) VALUES ($1, $2)', [
      PROVISIONAL_CITY.id,
      PROVISIONAL_CITY.name,
    ]);
    for (const name of PROVISIONAL_ZONES) {
      await client.query(
        `INSERT INTO "zone" (id, city_id, parent_id, kind, category, name, ubigeo, postal_code, source)
         VALUES ($1, $2, NULL, 'municipio', NULL, $3, NULL, NULL, 'INE')`,
        [`provisional-${name}`, PROVISIONAL_CITY.id, name],
      );
    }
  });

  afterAll(async () => {
    await withPoolCleanup(client, async () => {
      // El seed vuelve a dejar la base como la encontró cualquier otra suite:
      // esta comparte el contenedor con las demás, y `fileParallelism: false`
      // sólo garantiza el orden, no que la última en correr limpie.
      await seed(database as unknown as SeedDatabase);
    });
  });

  it("rechaza la base provisional que producción tenía, y nombra lo que falta", async () => {
    const gaps = await findTaxonomyGapsIn(database as unknown as SmokeDatabase);

    expect(gaps.map((gap) => gap.subject).sort()).toStrictEqual(["city", "zone"]);

    const city = gaps.find((gap) => gap.subject === "city");
    // Cinco áreas define la taxonomía; la base tiene una, y no es ninguna de
    // ellas. Se afirma el número acá —y se deriva de los documentos en el
    // chequeo— para que las dos mitades no puedan estar de acuerdo por
    // repetirse la una a la otra.
    expect(city?.expected).toBe(5);
    expect(city?.actual).toBe(0);
    expect(city?.missing).toContain("Caracas");

    const zone = gaps.find((gap) => gap.subject === "zone");
    expect(zone?.expected).toBe(5796);
    expect(zone?.actual).toBe(0);
  });

  it("acepta la taxonomía que el seed deja de verdad", async () => {
    await seed(database as unknown as SeedDatabase);

    expect(await findTaxonomyGapsIn(database as unknown as SmokeDatabase)).toStrictEqual([]);
  }, 120_000);
});
