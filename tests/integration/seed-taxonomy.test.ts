import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SeedDatabase, seed, seedTaxonomy } from "../../src/shared/db/seed";
import { withPoolCleanup } from "./support/pool-cleanup";

/**
 * **La taxonomía sin la demostración (17.15).**
 *
 * `seed()` era una sola función sin bandera: sembrar las 5.796 zonas del
 * territorio real obligaba a insertar además dos publicantes inventados y
 * diez avisos de mentira. Por eso nadie corrió nunca `pnpm db:seed` contra
 * el despliegue, y por eso producción llegó sin taxonomía.
 *
 * Lo que ninguna afirmación miraba —y es lo único que hace que esto se pueda
 * cablear al despliegue— es la MITAD QUE NO PASA: que `seedTaxonomy` no cree
 * ni un usuario ni un aviso. Un seed de taxonomía que dejara caer un aviso
 * de demostración en producción sería peor que no correrlo.
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
const database = drizzle(client) as unknown as SeedDatabase;

async function countRows(table: string): Promise<number> {
  const result = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
  return result.rows[0].n as number;
}

describe("seedTaxonomy", () => {
  beforeAll(async () => {
    await client.connect();
    // A clean slate, and the same order as `seed.test.ts` for the same
    // reason: listing references user, zone and city. The user DELETE is
    // scoped to the seed publishers so the wipe cannot reach rows another
    // suite owns.
    await client.query('DELETE FROM "listing"');
    await client.query('DELETE FROM "zone"');
    await client.query('DELETE FROM "city"');
    await client.query(`DELETE FROM "user" WHERE email LIKE '%@rentas.invalid'`);
    await seedTaxonomy(database);
  }, 120_000);

  afterAll(async () => {
    await withPoolCleanup(client, async () => {
      // Deja la base como la encontró cualquier otra suite: este archivo
      // comparte el contenedor con las demás, y `fileParallelism: false`
      // sólo garantiza el orden, no que la última en correr limpie.
      await seed(database);
    });
  }, 120_000);

  it("populates the full taxonomy", async () => {
    // Los mismos números que `seed.test.ts` afirma para el seed completo:
    // partir la función no puede cambiar ni una fila del territorio.
    expect(await countRows("city")).toBe(5);
    expect(await countRows("zone")).toBe(5796);
    expect(await countRows("zone_alias")).toBe(3547);
  });

  it("inserts no user and no listing, so it can run against the real deployment", async () => {
    // La afirmación que autoriza el cableado al despliegue. Si esto sube de
    // cero, `pnpm db:seed:taxonomy` mete datos de mentira en producción.
    const publishers = await client.query(
      `SELECT count(*)::int AS n FROM "user" WHERE email LIKE '%@rentas.invalid'`,
    );
    expect(publishers.rows[0].n).toBe(0);
    expect(await countRows("listing")).toBe(0);
  });
});
