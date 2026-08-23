import { chooseRelief, type SearchRelief } from "../domain/search-confirm";
import type { SearchCriteria } from "../domain/search-criteria";
import {
  buildSearchPanel,
  type PanelCity,
  type PanelZone,
  relaxableFilters,
  reliefHref,
  type SearchPanelModel,
  withoutFilter,
} from "../domain/search-panel";
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
 * 1. **Un conteo por ciudad** (F3). El puerto exige una ciudad por consulta —
 *    es la garantía de aislamiento del D5— así que "47 en Caracas y 23 en
 *    Maracaibo" son dos preguntas. Salen en paralelo: Neon es HTTP y en
 *    paralelo cuestan un viaje, no dos.
 * 2. **Las zonas ofrecidas salen del conteo, no del catálogo.** `zone` guarda
 *    la taxonomía entera —miles de filas por ciudad— y ofrecerlas todas sería
 *    una lista que nadie puede recorrer. El conteo devuelve una entrada por
 *    zona con avisos más las elegidas en cero, que es exactamente el conjunto
 *    que tiene sentido mostrar.
 * 3. **La salida del vacío se calcula sólo cuando hay un vacío** (F7). Cada
 *    candidata es una consulta más, y preguntar "¿cuántos habría sin el
 *    precio?" sobre una búsqueda con 16 resultados es pagar por una respuesta
 *    que nadie va a leer.
 */
export interface FilterPanelRequest {
  /** La ruta que se está viendo. Conserva la zona de la ruta, si hay. */
  readonly basePath: string;
  /** La ruta de la ciudad sola. Es adónde vuelve «Limpiar todo». */
  readonly cityPath: string;
  readonly query: SearchQuery;
  readonly cityId: string;
  readonly cities: readonly Omit<PanelCity, "count">[];
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
}

export async function buildFilterPanel(
  facets: FacetedSearchPort,
  request: FilterPanelRequest,
): Promise<FilterPanelResult> {
  const { criteria, chosenZoneIds } = request;

  const [counts, ...cityCounts] = await Promise.all([
    facets.countFacets(criteria, chosenZoneIds),
    ...request.cities.map(async (city) => {
      if (city.id === criteria.cityId) return null;
      // **Sin las zonas**: pertenecen a la ciudad que se está mirando, y
      // arrastrarlas a la otra daría cero sobre una ciudad llena de avisos.
      const { zoneIds: _zoneIds, ...rest } = criteria;
      return facets.countFacets({ ...rest, cityId: city.id }, []);
    }),
  ]);

  const cities: readonly PanelCity[] = request.cities.map((city, index) => ({
    ...city,
    count: (cityCounts[index] ?? counts).total,
  }));

  // Las zonas ofrecidas: las que el conteo nombra, en el orden del catálogo. Un
  // id que este catálogo de ciudad no tiene se descarta — el conteo pertenece a
  // la ciudad del criterio, pero el nombre para dibujarlo sale de acá.
  const zones = request.zones.filter((zone) => zone.id in counts.byZone);

  return {
    counts,
    panel: buildSearchPanel({
      basePath: request.basePath,
      cityPath: request.cityPath,
      query: request.query,
      cityId: request.cityId,
      cities,
      zones,
      chosenZoneIds,
      counts,
      criteria,
      relief: await findRelief(facets, request, counts.total),
      ...(request.onlyListingHref === undefined
        ? {}
        : { onlyListingHref: request.onlyListingHref }),
    }),
  };
}

/**
 * Qué filtro soltar cuando no coincide nada, con su número real.
 *
 * Una consulta por filtro puesto, y sólo en el vacío. Sin filtros puestos no
 * hay nada que soltar: la ciudad no se afloja —no es un filtro, es el alcance—
 * así que la respuesta honesta es que no hay salida por acá, y la pantalla lo
 * dice en vez de inventar una.
 */
async function findRelief(
  facets: FacetedSearchPort,
  request: FilterPanelRequest,
  total: number,
): Promise<SearchRelief | null> {
  if (total > 0) return null;

  const filters = relaxableFilters(request.criteria, request.chosenZoneIds);
  if (filters.length === 0) return null;

  const candidates = await Promise.all(
    filters.map(async (filter) => ({
      filter,
      resultCount: (await facets.countFacets(withoutFilter(request.criteria, filter), [])).total,
      href: reliefHref(request, filter),
    })),
  );

  return chooseRelief(candidates);
}
