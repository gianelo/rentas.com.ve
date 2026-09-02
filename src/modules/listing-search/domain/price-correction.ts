import { type PriceBucketTally, type PriceExtremes, priceExtremes } from "./price-histogram";
import { readPriceUsd } from "./search-criteria";
import { SEARCH_QUERY_NAMES, type SearchQuery } from "./search-query";

/**
 * **Lo que la búsqueda le corrigió al precio, dicho** (task 14.13, F5).
 *
 * `buildSearchCriteria` ya intercambia un rango invertido —«si el mínimo supera
 * al máximo, se intercambian en vez de dar error»— y lo hace **en silencio**.
 * Una corrección callada es una pantalla mintiendo sobre lo que hizo: alguien
 * pidió de $900 a $300 y está mirando los resultados de $300 a $900 sin una
 * sola palabra que lo explique. Este archivo escribe esa palabra.
 *
 * **Vive en el dominio y no en la pantalla**: qué dice una búsqueda corregida
 * es una decisión de producto, las entradas son las mismas tres de
 * `orderPrices`, y el suelo de cobertura del 90 % llega acá y no a `app/`.
 *
 * **Los «extremos reales» no cuestan una pregunta nueva, y ésa es la decisión
 * de arquitectura del archivo.** Son el precio del más barato y el del más caro
 * **de lo que matcheó**, y ya vienen en la única consulta que la 14.11 ganó:
 * `FacetCounts.byPriceBucket` trae `lowestUsd`/`highestUsd` por cubo (14.12,
 * rebanada B). Sirven justo cuando hacen falta porque **el precio no se cuenta
 * contra su propio filtro**: con un mínimo de $5000 la lista vuelve vacía y los
 * cubos siguen describiendo el mercado entero. `queries === 1` no se toca.
 *
 * **La asimetría entre las dos correcciones es deliberada.** Un extremo FLOJO
 * —un mínimo por debajo del más barato— no recorta nada, así que ajustarlo a la
 * punta real no cambia una fila y se anuncia como ajuste porque el ajuste es
 * exacto. Uno que **pasó de largo** sí cambiaría los resultados, y las filas ya
 * se trajeron con el rango pedido: anunciar ahí un ajuste que no ocurrió es la
 * misma mentira que corregir en silencio, vista del otro lado. Se dice el
 * hecho, y la salida con su conteo la ofrece `search-exits.ts` (14.15).
 */

/** Los dos extremos tal como los pidió la dirección, antes de ordenarlos. */
export interface AskedPriceRange {
  readonly minUsd?: number;
  readonly maxUsd?: number;
}

/** Un precio como lo escribe el resto de la casa: `$250`, sin separador de miles. */
function usd(value: number): string {
  return `$${value}`;
}

/**
 * El rango ya ordenado más la frase del intercambio, o `null` si no hubo.
 *
 * Es el espejo de `orderPrices`, que es quien de verdad lo intercambia; acá se
 * repite la comparación para poder DECIRLA, con los números tal como se
 * pidieron — lo único que explica por qué el formulario muestra otros dos.
 */
function ordered(asked: AskedPriceRange) {
  const { minUsd: min, maxUsd: max } = asked;
  if (min === undefined || max === undefined || min <= max) return { min, max, swapped: null };

  return {
    min: max,
    max: min,
    swapped: `Pediste de ${usd(min)} a ${usd(max)}, al revés: se buscó de ${usd(max)} a ${usd(min)}.`,
  };
}

/**
 * Lo que hay que decir, en el orden en que se lee. Vacío cuando no se corrigió
 * nada — que es el caso normal y por eso no hay un «no se corrigió» que dibujar.
 */
export function priceRangeNotices(
  asked: AskedPriceRange,
  matched: PriceExtremes | null,
): readonly string[] {
  // Se ajusta y se explica el rango YA ordenado: es el que produjo las filas.
  const { min, max, swapped } = ordered(asked);
  const notices: string[] = swapped === null ? [] : [swapped];

  // Sin filas que mirar no hay extremo real que nombrar, y uno inventado se
  // lee igual que uno cierto (AGENTS.md §7).
  if (matched === null) return notices;

  // Pasarse de largo se dice UNA vez: es la causa del vacío, y explicar encima
  // un ajuste que no recorta nada es ruido sobre la única frase que importa.
  if (min !== undefined && min > matched.highestUsd) {
    notices.push(
      `Ningún alquiler llega a ${usd(min)}: el más caro cuesta ${usd(matched.highestUsd)}.`,
    );
    return notices;
  }
  if (max !== undefined && max < matched.lowestUsd) {
    notices.push(
      `Ningún alquiler baja de ${usd(max)}: el más barato cuesta ${usd(matched.lowestUsd)}.`,
    );
    return notices;
  }

  if (min !== undefined && min < matched.lowestUsd) {
    notices.push(
      `El mínimo de ${usd(min)} se ajustó a ${usd(matched.lowestUsd)}: no hay nada más barato.`,
    );
  }
  if (max !== undefined && max > matched.highestUsd) {
    notices.push(
      `El máximo de ${usd(max)} se ajustó a ${usd(matched.highestUsd)}: no hay nada más caro.`,
    );
  }

  return notices;
}

/**
 * La misma regla sobre lo que la pantalla tiene a mano: la dirección tal como
 * llegó y los cubos que la consulta ya devolvió. Los precios se leen con
 * `readPriceUsd`, **la misma función que arma el criterio**: un segundo lector
 * que aceptara `1.5` explicaría un filtro que nunca se aplicó.
 */
export function priceCorrectionNotices(
  query: SearchQuery,
  tally: readonly PriceBucketTally[],
): readonly string[] {
  const minUsd = readPriceUsd(query[SEARCH_QUERY_NAMES.minPrice]);
  const maxUsd = readPriceUsd(query[SEARCH_QUERY_NAMES.maxPrice]);

  return priceRangeNotices({ minUsd, maxUsd }, priceExtremes(tally));
}
