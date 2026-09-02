import { resolvePagination } from "../domain/pagination";
import type { SearchCriteria } from "../domain/search-criteria";
import {
  bestExit,
  resolveSearchOutcome,
  type SearchOutcome,
  widenPrice,
} from "../domain/search-exits";
import { buildSearchPanel, type PanelZone, type SearchPanelModel } from "../domain/search-panel";
import type { SearchQuery } from "../domain/search-query";
import type { FacetCounts, FacetedSearchPort } from "./ports/faceted-search.port";

/**
 * **El panel de filtros armado contra la base, en un solo lugar.**
 *
 * Existe porque las dos pantallas de búsqueda —`/alquiler/<ciudad>` y
 * `/alquiler/<ciudad>/<zona>`— necesitan exactamente lo mismo, y la alternativa
 * era el mismo bloque de orquestación copiado en dos páginas. La regla del
 * `design.md` es clara sobre eso: `app/` traduce una petición en una llamada, y
 * una página que orquesta puertos es una página que se volvió infraestructura.
 *
 * Lo que decide acá es **a quién se le pregunta qué**, y son tres decisiones:
 *
 * 1. **Una consulta y una sola, para toda la pantalla** (14.11, corregido por
 *    la 14.50). Hasta el 2026-09-02 acá salía además una consulta por CADA
 *    otra ciudad —un `Promise.all` sobre el catálogo— para llenar un conteo
 *    por ciudad que ninguna pantalla dibuja desde que la 14.36 sacó el paso de
 *    ubicación del panel. Se pagaba y no se mostraba, y crecía con el catálogo.
 *    La cota vive ahora en `tests/integration/faceted-search.test.ts` («el
 *    panel entero cuesta UN viaje de red»): **medida acá arriba y no sólo
 *    dentro del adaptador**, que es por dónde se coló.
 * 2. **Las zonas ofrecidas salen del conteo, no del catálogo.** `zone` guarda
 *    la taxonomía entera —miles de filas por ciudad— y ofrecerlas todas sería
 *    una lista que nadie puede recorrer. El conteo devuelve una entrada por
 *    zona con avisos más las elegidas en cero, que es exactamente el conjunto
 *    que tiene sentido mostrar.
 * 3. **Las salidas no cuestan una consulta** (F10 y F11). Antes eran una por
 *    filtro puesto y sólo en el vacío, porque cada candidata era un viaje más.
 *    Ahora los nueve números vienen en la misma consulta que las facetas
 *    —`FacetCounts.withoutFilter`— y por eso se pueden ofrecer también con
 *    resultados en pantalla: el cierre de la lista los necesita en TODA
 *    búsqueda, y una consulta por filtro en cada búsqueda no era pagable.
 */
export interface FilterPanelRequest {
  /** La ruta que se está viendo. Conserva la zona de la ruta, si hay. */
  readonly basePath: string;
  /** La ruta de la ciudad sola. Es adónde vuelve «Limpiar todo». */
  readonly cityPath: string;
  readonly query: SearchQuery;
  /** El nombre de la ciudad que se está mirando. Su id ya viaja en `criteria`. */
  readonly cityName: string;
  /** Las zonas de ESTA ciudad, en el orden del catálogo. */
  readonly zones: readonly PanelZone[];
  readonly chosenZoneIds: readonly string[];
  readonly criteria: SearchCriteria;
  /** La ficha del único resultado, cuando hay exactamente uno (F7). */
  readonly onlyListingHref?: string;
}

export interface FilterPanelResult {
  readonly panel: SearchPanelModel;
  /**
   * Los conteos crudos. Se devuelven para que la pantalla no vuelva a pedirlos:
   * el total es el mismo número que la paginación necesita, y pedirlo dos veces
   * son dos viajes a Neon por el mismo dato.
   */
  readonly counts: FacetCounts;
  /**
   * Qué le pasa a la lista: el vacío con su causa y sus salidas, o el cierre
   * con el cambio que más suma (F10 y F11). Lo decide el dominio; la pantalla
   * lo dibuja.
   */
  readonly outcome: SearchOutcome;
}

export async function buildFilterPanel(
  facets: FacetedSearchPort,
  request: FilterPanelRequest,
): Promise<FilterPanelResult> {
  const { criteria, chosenZoneIds } = request;

  // El escalón siguiente de precio viaja con la pregunta: es un número más en
  // la misma consulta, y la alternativa es un viaje entero para él solo.
  const counts = await facets.countFacets(
    criteria,
    chosenZoneIds,
    widenPrice(criteria) ?? undefined,
  );

  // Las zonas ofrecidas: las que el conteo nombra, en el orden del catálogo. Un
  // id que este catálogo de ciudad no tiene se descarta — el conteo pertenece a
  // la ciudad del criterio, pero el nombre para dibujarlo sale de acá.
  const zones = request.zones.filter((zone) => zone.id in counts.byZone);

  // La misma paginación que la pantalla arma para sus enlaces, porque la
  // pregunta «¿están todos?» es «¿hay página siguiente?» y no otra cosa.
  const outcome = resolveSearchOutcome({
    basePath: request.basePath,
    cityPath: request.cityPath,
    query: request.query,
    cityName: request.cityName,
    criteria,
    chosenZoneIds,
    zones,
    counts,
    pagination: resolvePagination(criteria.page, counts.total),
  });

  return {
    counts,
    outcome,
    panel: buildSearchPanel({
      basePath: request.basePath,
      cityPath: request.cityPath,
      query: request.query,
      cityName: request.cityName,
      zones,
      chosenZoneIds,
      counts,
      criteria,
      // El botón del acordeón ofrece **la misma** salida que encabeza la lista
      // vacía: dos pantallas proponiendo cambios distintos para el mismo cero
      // son dos consejos, y uno de los dos sobra.
      relief: outcome.kind === "empty" ? bestExit(outcome.exits) : null,
      ...(request.onlyListingHref === undefined
        ? {}
        : { onlyListingHref: request.onlyListingHref }),
    }),
  };
}
