import { characterCount } from "../../listing-publication/domain/publishable-listing";
import type { ImportRow } from "./csv-import-rows";

/**
 * tasks.md 9.29 — las celdas que la lámina 14g dibuja al lado del problema.
 *
 * **El desvío 2 de la 9.26, cerrado.** `ImportRowError` sólo llevaba
 * `rowNumber` y `reasons`, así que la vista previa podía nombrar la fila y el
 * problema pero no el valor ofensor, y `app/importar/import-copy.ts` tuvo que
 * escribir «La descripción es más corta que el mínimo» donde 14g escribe «La
 * descripción tiene 61 caracteres, hacen falta 120». Su propio comentario lo
 * decía: «Ese 24 sale de un `PublishCopyContext` que la importación no
 * tiene».
 *
 * **De la fila CRUDA, no de la resuelta.** `applyResolvedLocations`
 * (`resolve-import-locations.ts`) reemplaza `city`/`zone` por sus ids antes
 * de validar, así que la fila que llega al validador ya no tiene el nombre
 * que la inmobiliaria escribió — y para una fila cuya zona no se pudo
 * resolver no tiene nada. La tabla de 14g muestra «El Rosal» junto a «"El
 * Rosal" no existe en Maracaibo», que es el nombre del archivo. Por eso esta
 * función se alimenta de `rows` y no de `preparedRows`.
 */

/** Las cinco columnas que 14g dibuja entre «Fila» y «Problema». */
export type ImportRowCellName = "externalReference" | "priceUsd" | "zone" | "rooms" | "title";

export interface ImportRowCells {
  readonly externalReference: string;
  readonly priceUsd: string;
  readonly zone: string;
  readonly rooms: string;
  readonly title: string;
  /**
   * No es una celda de la tabla: es lo único que le falta a la copia para
   * decir «tiene 61» en vez de una frase sin número. Viaja el conteo y no el
   * texto porque la descripción puede pesar 1.200 caracteres y la pantalla
   * sólo necesita cuántos son.
   */
  readonly descriptionLength: number;
}

/**
 * Qué celda nombra cada código estable. **Sólo las cinco que la tabla
 * dibuja**: un código sobre la descripción o sobre el contacto de la cuenta
 * no resalta nada, porque no hay dónde. Resaltar «lo más parecido» pondría
 * el marcador sobre un valor que está bien.
 */
const CELL_BY_VIOLATION: Readonly<Record<string, ImportRowCellName>> = {
  "externalReference.required": "externalReference",
  "externalReference.duplicateInFile": "externalReference",
  "priceUsd.required": "priceUsd",
  "priceUsd.invalid": "priceUsd",
  "zoneId.required": "zone",
  "zoneId.notInCity": "zone",
  "rooms.required": "rooms",
  "rooms.invalid": "rooms",
  "title.required": "title",
  "title.tooLong": "title",
};

export function importRowCells(row: ImportRow): ImportRowCells {
  return {
    externalReference: row.externalReference ?? "",
    priceUsd: row.priceUsd ?? "",
    zone: row.zone ?? "",
    rooms: row.rooms ?? "",
    title: row.title ?? "",
    descriptionLength: characterCount(row.description ?? ""),
  };
}

/**
 * En el orden en que aparecen las razones y sin repetir: una fila con
 * `zoneId.required` y `zoneId.notInCity` resalta la zona una sola vez.
 *
 * Una razón que la tabla no conoce no resalta nada. `ImportRowViolation`
 * incluye `string` porque `resolve-import-locations.ts` viaja como frase ya
 * escrita, y adivinarle una celda a una frase sería inventar el dato — que es
 * exactamente lo que la 9.26 se negó a hacer al dejar esto anotado.
 */
export function offendingCellsFor(reasons: readonly string[]): readonly ImportRowCellName[] {
  const cells: ImportRowCellName[] = [];
  for (const reason of reasons) {
    const cell = CELL_BY_VIOLATION[reason];
    if (cell !== undefined && !cells.includes(cell)) cells.push(cell);
  }
  return cells;
}
