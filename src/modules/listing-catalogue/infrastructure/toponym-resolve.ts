import { territoryId } from "./territorio-import";
import type { ParsedMunicipality } from "./territorio-parser";
import type { ToponymEntry } from "./toponym-index";

/**
 * Ata cada topónimo del índice a la fila del árbol que nombra.
 *
 * **Puro, y resuelve DENTRO de un archivo.** El índice dice «parroquia →
 * entrada», y un nombre de parroquia no es único en todo el país — pero sí lo
 * es dentro de los municipios que un archivo documenta. Resolver por archivo es
 * lo que hace que el par alcance; resolver contra el corpus entero volvería a
 * traer el problema que este índice vino a arreglar.
 */

export interface AliasRow {
  readonly zoneId: string;
  readonly alias: string;
}

export interface AliasResult {
  readonly aliases: readonly AliasRow[];
  /**
   * Apariciones que no encontraron su fila. **Se informan, nunca se inventan.**
   * Un alias que apunta a una zona inexistente es una sugerencia que lleva a
   * cero resultados, que es exactamente lo que el producto no puede hacer.
   */
  readonly unresolved: readonly ToponymEntry[];
}

export function buildAliasRows(
  municipalities: readonly ParsedMunicipality[],
  toponyms: readonly ToponymEntry[],
  areaOf: (municipality: string) => string | null,
): AliasResult {
  // (parroquia, nombre de entrada) -> id de la fila del árbol. La categoría
  // entra en el id, así que el índice se arma recorriendo los elementos y no
  // recalculando el camino desde el nombre.
  const byParishAndName = new Map<string, string>();

  for (const municipality of municipalities) {
    const area = areaOf(municipality.name);
    if (!area) continue;

    for (const parish of municipality.parishes) {
      const parishPath = `${area}/${municipality.name}/${parish.name}`;
      for (const element of parish.elements) {
        byParishAndName.set(
          `${parish.name}|${element.name}`,
          territoryId(`${parishPath}/${element.category}/${element.name}`),
        );
      }
      // La parroquia misma también puede ser el destino: el índice la nombra
      // cuando la entrada y la parroquia coinciden.
      byParishAndName.set(`${parish.name}|${parish.name}`, territoryId(parishPath));
    }
  }

  const aliases: AliasRow[] = [];
  const unresolved: ToponymEntry[] = [];
  const seen = new Set<string>();

  for (const entry of toponyms) {
    const zoneId = byParishAndName.get(`${entry.parish}|${entry.entry}`);
    if (!zoneId) {
      unresolved.push(entry);
      continue;
    }

    // **El alias que repite el nombre de la fila no se guarda.** Buscar por el
    // nombre completo ya funciona contra `zone.name`; un alias idéntico sería
    // una segunda copia del mismo dato que puede quedar desincronizada. Lo que
    // vale la pena guardar es el topónimo ENTERRADO, que es lo que hoy no
    // encuentra nada.
    if (entry.toponym === entry.entry) continue;

    const key = `${zoneId}|${entry.toponym}`;
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push({ zoneId, alias: entry.toponym });
  }

  return { aliases, unresolved };
}
