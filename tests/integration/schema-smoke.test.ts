import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { findSchemaDrift } from "../../src/modules/operability/domain/schema-drift";
import {
  actualTableShapes,
  expectedTableShapes,
  type SmokeDatabase,
} from "../../src/modules/operability/infrastructure/schema-shapes";
import * as schema from "../../src/shared/db/schema";

/**
 * **El chequeo de humo de la 11b.5, contra Postgres real.**
 *
 * Una afirmación que pasa contra el esquema de hoy no prueba nada: probaría
 * que dos listas iguales son iguales. Lo que este archivo hace es
 * **construir el fallo del 2026-08-17** —un `select` que nombra una columna
 * que la base no tiene— y mostrar las dos mitades: que Postgres lo rechaza, y
 * que el chequeo lo nombra ANTES de que un visitante lo encuentre.
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

afterAll(async () => {
  await pool.end();
});

/**
 * El mensaje **de Postgres**, no el envoltorio de Drizzle. Drizzle reemplaza
 * el mensaje por `Failed query: <sql>` y deja el original en `cause`, así que
 * afirmar sobre el de arriba afirmaría que el SQL dice lo que el SQL dice —
 * y pasaría igual si la consulta hubiera fallado por otra razón.
 */
async function errorDePostgres(consulta: Promise<unknown>): Promise<string> {
  try {
    await consulta;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    return cause instanceof Error ? cause.message : String(error);
  }
  throw new Error("la consulta no falló, y esta prueba depende de que falle");
}

describe("el chequeo de humo del esquema", () => {
  it("no reporta deriva contra la base que las migraciones acaban de dejar", async () => {
    const drift = findSchemaDrift(
      expectedTableShapes(),
      await actualTableShapes(db as unknown as SmokeDatabase),
    );

    expect(drift).toStrictEqual([]);
  });

  /**
   * **El fallo, construido y no afirmado.** Primero el síntoma que el fundador
   * encontró entrando a su propio producto, contra esta base; después el
   * chequeo, al que se le dice que el código espera esa columna.
   */
  it("caza un select que nombra una columna que la base no tiene", async () => {
    expect(
      await errorDePostgres(db.execute(sql`select contact_method_ausente from listing limit 1`)),
    ).toBe('column "contact_method_ausente" does not exist');

    const drift = findSchemaDrift(
      [{ table: "listing", columns: ["id", "contact_method_ausente"] }],
      await actualTableShapes(db as unknown as SmokeDatabase),
    );

    expect(drift).toStrictEqual([
      { table: "listing", missingTable: false, missingColumns: ["contact_method_ausente"] },
    ]);
  });

  /** El otro medio defecto de aquel día: `listing_photo` no existía entero. */
  it("caza una tabla entera que la base no tiene", async () => {
    expect(
      await errorDePostgres(db.execute(sql`select id from listing_photo_ausente limit 1`)),
    ).toBe('relation "listing_photo_ausente" does not exist');

    const drift = findSchemaDrift(
      [{ table: "listing_photo_ausente", columns: ["id"] }],
      await actualTableShapes(db as unknown as SmokeDatabase),
    );

    expect(drift).toStrictEqual([
      { table: "listing_photo_ausente", missingTable: true, missingColumns: ["id"] },
    ]);
  });
});
