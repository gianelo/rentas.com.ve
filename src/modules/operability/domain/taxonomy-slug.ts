/**
 * **Si una fila de `city` o `zone` no tiene el slug que `slugify(name)`
 * produciría hoy, esto lo dice** (tasks.md 27.1, slice A).
 *
 * `city.slug` y `zone.slug` son nullable a propósito (ver `schema.ts`): la
 * migración sólo puede AGREGAR la columna, nunca llenarla, porque `slugify`
 * hace normalización NFD y un regex de JavaScript que Postgres no puede
 * reproducir dentro de un `UPDATE` de migración sin reimplementar la regla en
 * SQL — justo la duplicación que AGENTS.md §1 y el precedente de la 22.31
 * rechazan. Sin un chequeo que falle cerrado, un NULL sobreviviente sería
 * silenciosamente aceptable: el tipo de la columna no lo impide.
 *
 * Vive en el dominio y no en la infraestructura por la misma razón que
 * `taxonomy-gap`: la decisión no es «leer una columna», es qué hace a un
 * valor correcto — y esa regla no cambia según qué driver trajo la fila.
 */
import type { slugify } from "../../listing-discovery/domain/listing-url";

export interface SlugCensusRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string | null;
}

export interface SlugGap {
  readonly subject: "city" | "zone";
  readonly id: string;
  readonly name: string;
  /** NULL o vacío cuando nunca se escribió; otro valor cuando quedó viejo. */
  readonly slug: string | null;
}

/**
 * Compara cada fila contra lo que la MISMA `slugify` produciría hoy, en vez
 * de sólo comprobar «no NULL». Eso atrapa el caso real que un chequeo de
 * presencia no ve: una fila cuyo slug quedó de una corrida anterior y ya no
 * coincide con el nombre actual.
 */
export function findSlugGaps(
  subject: SlugGap["subject"],
  rows: readonly SlugCensusRow[],
  deriveSlug: typeof slugify,
): readonly SlugGap[] {
  return rows
    .filter((row) => !row.slug || row.slug !== deriveSlug(row.name))
    .map((row) => ({ subject, id: row.id, name: row.name, slug: row.slug }));
}

export function describeSlugGaps(gaps: readonly SlugGap[]): string {
  return gaps
    .map(
      (gap) =>
        `  ${gap.subject} ${gap.id} ("${gap.name}"): slug es ${
          gap.slug === null ? "NULL" : gap.slug === "" ? "la cadena vacía" : `"${gap.slug}"`
        }`,
    )
    .join("\n");
}
