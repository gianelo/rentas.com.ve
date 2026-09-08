/**
 * **El backfill del `slug` nullable, y el gate que lo hace cerrar de verdad**
 * (tasks.md 27.1, slice A). Ver `taxonomy-slug.ts` (dominio) para por qué la
 * columna no puede llegar `NOT NULL` desde la migración.
 *
 * Corre desde `scripts/taxonomy-smoke.ts`, en el mismo lugar donde ese script
 * ya verifica el contenido de un despliegue después de migrar. Es idempotente
 * por construcción: sobre una base sana `findSlugGaps` no devuelve nada, así
 * que la reparación lee y no escribe.
 *
 * **La reparación y el gate deciden con la MISMA función, y eso no es
 * higiene.** Esta reparación nació mirando sólo `slug IS NULL` mientras el
 * gate rechazaba además el slug viejo —el que quedó de una corrida anterior y
 * ya no coincide con su nombre—. Con esa asimetría, una fila con slug no nulo
 * pero desactualizado era **irreparable y bloqueante para siempre**: el
 * backfill no la tocaba nunca y el gate la reportaba siempre, y el
 * `process.exit(1)` de `taxonomy-smoke.ts` tumbaba ese despliegue y todos los
 * siguientes. El disparador no es hipotético: `slugify` es una función de
 * dominio compartida que esta rebanada acaba de cablear en cuatro caminos de
 * escritura, y una sola edición suya deja viejas las 5.813 filas de una vez.
 * Salir de ahí habría exigido SQL a mano contra producción, porque ningún
 * cambio de código posterior podía volver a poner esos slugs en NULL.
 */
import { sql } from "drizzle-orm";
import { slugify } from "../../listing-discovery/domain/listing-url";
import { findSlugGaps, type SlugGap } from "../domain/taxonomy-slug";
import { type SmokeDatabase, smokeRows } from "./schema-shapes";

/**
 * Mismo tamaño que los lotes de `seed.ts`: acotado por el tope de parámetros
 * por sentencia de Postgres, no por gusto.
 */
const BATCH = 500;

type TaxonomyTable = "city" | "zone";

/**
 * Un `UPDATE ... FROM (VALUES ...)` por lote, no una sentencia por fila: con
 * hasta 5.813 zonas, un viaje de red por fila sería el mismo defecto de
 * cuota que la Fase 27 entera existe para cerrar. `sql.raw` sólo nombra la
 * tabla, que sale del tipo `TaxonomyTable` de este archivo y nunca de datos
 * de nadie.
 */
async function backfillTable(db: SmokeDatabase, table: TaxonomyTable): Promise<number> {
  // Se traen todas las filas y **decide `findSlugGaps`**, que es exactamente
  // la función con la que el gate de más abajo va a juzgar el resultado. El
  // filtro no puede vivir en el `where` porque Postgres no puede correr
  // `slugify` —normalización NFD y un regex de JavaScript—, que es la misma
  // razón por la que la columna es nullable. No agrega un viaje: el gate ya
  // leía las filas enteras para probar el estado final.
  const rows = smokeRows<{ id: string; name: string; slug: string | null }>(
    await db.execute(sql.raw(`select id, name, slug from "${table}"`)),
  );
  const pending = findSlugGaps(table, rows, slugify);

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const values = sql.join(
      batch.map((row) => sql`(${row.id}::text, ${slugify(row.name)}::text)`),
      sql`, `,
    );
    await db.execute(sql`
      update ${sql.raw(`"${table}"`)} as t
         set slug = data.slug
        from (values ${values}) as data(id, slug)
       where t.id = data.id
    `);
  }

  return pending.length;
}

export interface SlugBackfillResult {
  readonly citiesBackfilled: number;
  readonly zonesBackfilled: number;
}

export async function backfillTaxonomySlugs(db: SmokeDatabase): Promise<SlugBackfillResult> {
  return {
    citiesBackfilled: await backfillTable(db, "city"),
    zonesBackfilled: await backfillTable(db, "zone"),
  };
}

/**
 * El gate que falla cerrado. Corre DESPUÉS del backfill de arriba y vuelve a
 * leer las filas enteras —no confía en el conteo que el backfill devolvió—
 * porque lo que tiene que quedar probado es el ESTADO final de la base, no
 * que la función de backfill dijo haber terminado.
 */
export async function findTaxonomySlugGapsIn(db: SmokeDatabase): Promise<readonly SlugGap[]> {
  const cityRows = smokeRows<{ id: string; name: string; slug: string | null }>(
    await db.execute(sql`select id, name, slug from "city"`),
  );
  const zoneRows = smokeRows<{ id: string; name: string; slug: string | null }>(
    await db.execute(sql`select id, name, slug from "zone"`),
  );

  return [...findSlugGaps("city", cityRows, slugify), ...findSlugGaps("zone", zoneRows, slugify)];
}
