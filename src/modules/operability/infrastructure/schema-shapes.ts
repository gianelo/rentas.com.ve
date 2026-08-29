import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../../../shared/db/schema";
import type { TableShape } from "../domain/schema-drift";

/**
 * Los dos lados de la comparación de la 11b.5: lo que el código nombra y lo
 * que la base tiene.
 *
 * **Lo que el código nombra sale de `schema.ts` y no de una lista escrita a
 * mano**, que es lo único que hace que el chequeo siga siendo cierto mañana.
 * Toda consulta de este producto pasa por Drizzle, así que las columnas del
 * esquema SON las columnas que un `select` puede nombrar: una lista aparte
 * empezaría a discrepar el día que alguien agregue un campo, que es
 * exactamente el día en que hace falta.
 */
export function expectedTableShapes(): readonly TableShape[] {
  // `flatMap` y no `filter` + predicado: el predicado tendría que declararse
  // `value is PgTable`, y ese tipo no es asignable a cada miembro concreto de
  // la unión que `Object.values(schema)` produce. `is` de Drizzle ya estrecha.
  return Object.values(schema).flatMap((value) => {
    if (!is(value, PgTable)) return [];
    const config = getTableConfig(value);
    return [{ table: config.name, columns: config.columns.map((column) => column.name) }];
  });
}

/** Cualquier handle de Drizzle sobre Postgres: el de Neon y el de `pg`. */
export interface SmokeDatabase {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
}

export async function actualTableShapes(db: SmokeDatabase): Promise<readonly TableShape[]> {
  const result = await db.execute(sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
  `);

  // `neon-http` devuelve las filas peladas y `node-postgres` un `QueryResult`.
  // El chequeo tiene que correr contra los dos: contra Neon en el despliegue y
  // contra el contenedor en la prueba que lo prueba.
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as {
    table_name: string;
    column_name: string;
  }[];

  const byTable = new Map<string, string[]>();
  for (const row of rows) {
    const columns = byTable.get(row.table_name) ?? [];
    columns.push(row.column_name);
    byTable.set(row.table_name, columns);
  }

  return [...byTable].map(([table, columns]) => ({ table, columns }));
}
