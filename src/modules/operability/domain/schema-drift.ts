/**
 * **Si el esquema desplegado no es el que el código espera, esto lo dice**
 * (tarea 11b.5).
 *
 * La 11b.1 hace que las migraciones lleguen con el código; esto es lo que la
 * **prueba** en vez de confiarla. El defecto que tiene que cazar está
 * nombrado, y ya ocurrió: un `select` que nombra una columna que la base no
 * tiene — `column "contact_method" does not exist`, cuatro días, encontrado
 * por el fundador entrando a su propio producto.
 *
 * **Vive en el dominio porque la decisión no es «comparar dos listas»: es en
 * qué dirección se compara.** Falta una columna que el código lee → despliegue
 * roto. Sobra una columna que el código todavía no lee → **correcto**, es el
 * paso 1 del `añadir anulable → rellenar → NOT NULL` que este proyecto exige
 * porque «no podemos borrar data real» (14.2, 11b.6). Un chequeo que fallara
 * en ese caso refutaría cada migración en tres pasos, y lo apagaría el primero
 * que lo sufriera.
 */
export interface TableShape {
  readonly table: string;
  readonly columns: readonly string[];
}

export interface SchemaDrift {
  readonly table: string;
  /** La tabla entera no existe. Fue el caso de `listing_photo`. */
  readonly missingTable: boolean;
  readonly missingColumns: readonly string[];
}

export function findSchemaDrift(
  expected: readonly TableShape[],
  actual: readonly TableShape[],
): readonly SchemaDrift[] {
  const live = new Map(actual.map((shape) => [shape.table, new Set(shape.columns)]));

  return expected
    .map((shape) => {
      const columns = live.get(shape.table);
      const missingColumns = [...shape.columns]
        .filter((column) => columns === undefined || !columns.has(column))
        .sort();

      return { table: shape.table, missingTable: columns === undefined, missingColumns };
    })
    .filter((drift) => drift.missingColumns.length > 0)
    .sort((a, b) => a.table.localeCompare(b.table));
}

/**
 * El mensaje. El del 2026-08-20 llegó como `column "contact_method" does not
 * exist` dentro de un intento de entrar; éste llega antes y dice qué falta.
 */
export function describeSchemaDrift(drift: readonly SchemaDrift[]): string {
  return drift
    .map(
      (entry) =>
        `  ${entry.table}: ${entry.missingTable ? "LA TABLA NO EXISTE" : entry.missingColumns.join(", ")}`,
    )
    .join("\n");
}
