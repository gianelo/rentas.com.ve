/**
 * La pastilla de búsqueda (tasks.md 14.30/14.31; diseño `Rentas - Cuenta e
 * Importar.dc.html` §14i — "contrato para todas las pantallas").
 *
 * **Una sola pieza, tres estados, y ninguna regla de producto en el
 * componente que la dibuja.** Qué muestra el texto, si el filtro aparece y
 * qué dice cuando aparece son decisiones — viven acá, con el piso del 90 %
 * de cobertura encima, no en `components/` (AGENTS.md §1).
 *
 * **"Sin búsqueda no hay nada que filtrar."** El filtro no existe como pieza
 * hasta que hay una zona elegida — es el estado de `/mis-avisos` y de
 * importar, y también el de `/` antes de escribir nada. No es "vacío pero
 * dibujado": la pieza entera está ausente.
 *
 * **Sin badge — la palabra dice el estado.** Con zona y sin filtros la
 * etiqueta es la palabra "Filtros", en el color neutro del control. En
 * cuanto hay uno o más filtros aplicados, la etiqueta cuenta ("3 filtros")
 * y pasa a acento. No hay un número flotando aparte de la palabra que lo
 * explica.
 *
 * **El conteo vive en la segunda línea del texto**, nunca en un badge
 * separado — es el mismo argumento que el del filtro: la forma habla, no
 * un adorno al lado.
 */

export interface ResolveSearchPillInput {
  /** `null` (o cadena vacía/en blanco) significa "ninguna zona elegida". */
  readonly zoneLabel: string | null;
  /** El total de avisos que esa zona/filtros arrojan. `null` cuando aún no se conoce. */
  readonly resultCount: number | null;
  /**
   * Cuántos filtros DISTINTOS de ciudad/zona están aplicados — precio,
   * tamaño, quién publica, atributos. Ciudad y zona no cuentan acá: "eso lo
   * resuelve el texto" (14i), nunca el panel de filtros.
   */
  readonly filterCount: number;
}

interface SearchPillEmpty {
  readonly kind: "empty";
}

export interface SearchPillSelected {
  readonly kind: "selected";
  readonly zoneLabel: string;
  readonly count: number;
  /** "Filtros" (neutro) o "N filtros" (acento) — nunca un número aparte. */
  readonly filterLabel: string;
  readonly filterAccent: boolean;
  /** El número crudo, para que el componente lo use como fallback en móvil. */
  readonly filterCount: number;
}

export type SearchPillState = SearchPillEmpty | SearchPillSelected;

function pluralFiltros(count: number): string {
  return `${count} filtro${count === 1 ? "" : "s"}`;
}

export function resolveSearchPill(input: ResolveSearchPillInput): SearchPillState {
  const zoneLabel = input.zoneLabel?.trim() ?? "";
  if (zoneLabel === "") return { kind: "empty" };

  const filterCount = Math.max(0, input.filterCount);

  return {
    kind: "selected",
    zoneLabel,
    count: Math.max(0, input.resultCount ?? 0),
    filterLabel: filterCount > 0 ? pluralFiltros(filterCount) : "Filtros",
    filterAccent: filterCount > 0,
    filterCount,
  };
}

export function formatListingCount(count: number): string {
  return `${count} aviso${count === 1 ? "" : "s"}`;
}
