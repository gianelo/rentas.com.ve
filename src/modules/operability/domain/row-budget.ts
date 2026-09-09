/**
 * **El techo de filas del camino de lectura** (tasks.md 27.4 — la otra mitad
 * del par de presupuestos que `scripts/budget-bundle.ts` abrió para bytes).
 *
 * El defecto que tumbó el sitio el 2026-09-07 no era un bug de un día: era
 * una consulta que siempre trajo la taxonomía entera y que, mientras el
 * catálogo tuvo diez filas, costaba lo mismo que cuando pasó a tener 5.813.
 * Nadie escribió la condición «esto deja de ser gratis si el catálogo
 * crece», así que nada se puso rojo el día que dejó de serlo (tasks.md 27.1).
 *
 * **300 no es una intuición.** Sale de medir una vista de página completa
 * (tasks.md 27.1, párrafo de medición, 2026-09-08): la consulta más cara
 * real del camino de lectura son 48 filas (`coversFor`, dos derivadas por
 * tarjeta — un número acotado por `RESULTS_PER_PAGE`, no por el tamaño del
 * catálogo), y la instancia más chica de la fuga histórica devolvió 791. 300
 * deja más de 6× de margen sobre lo real medido y sigue muy por debajo de
 * cualquier fuga conocida.
 *
 * **Vive en el dominio, no en `app/` ni en `infrastructure/`.** El suelo de
 * cobertura del 90 % (`vitest.config.ts`) llega a `src/modules/*\/domain/` y
 * no llega a `app/` — una regla escrita en la frontera es una regla que
 * ningún test run puede poner roja. Es pura a propósito, sin I/O y sin
 * `Date`: los adaptadores de infraestructura la llaman con el resultado que
 * ya trajeron, nunca al revés.
 */
export const ROW_BUDGET = 300;

export class RowBudgetExceededError extends Error {
  constructor(
    readonly label: string,
    readonly rowCount: number,
  ) {
    super(
      `row-budget: "${label}" devolvió ${rowCount} fila(s), más que el techo de ` +
        `${ROW_BUDGET} (tasks.md 27.4). Es casi con seguridad el mismo defecto que ` +
        "tumbó el sitio el 2026-09-07: una consulta del camino de lectura que dejó " +
        "de estar acotada y volvió a crecer con el tamaño del catálogo.",
    );
    this.name = "RowBudgetExceededError";
  }
}

/**
 * Falla ruidosamente si `rows` supera el techo de 300; si no, las devuelve
 * sin tocarlas. `label` identifica la consulta en el mensaje de error — es
 * lo único que distingue un techo cruzado de otro cuando el proceso que
 * llama esto lo deja escrito en un log o hace caer un job de CI.
 */
export function assertRowBudget<T>(rows: readonly T[], label: string): readonly T[] {
  if (rows.length > ROW_BUDGET) {
    throw new RowBudgetExceededError(label, rows.length);
  }
  return rows;
}
