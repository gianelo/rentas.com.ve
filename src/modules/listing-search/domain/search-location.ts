import { SEARCH_QUERY_NAMES, type SearchQuery } from "./search-query";

/**
 * **Un dato, un lugar: dónde vive la ubicación de una búsqueda** (resolución
 * del fundador, 2026-08-26).
 *
 * La 14.6 hizo `SearchCriteria.zoneIds` plural y combinado con O; la 14.36
 * escribió que *"la ubicación pasa a vivir SOLO en la ruta"*. Las dos no
 * podían valer a la vez, porque una ruta tiene **un** segmento de zona. La
 * resolución no mata la selección múltiple —«Chacao o Altamira» es una
 * búsqueda real, y «todo Caracas» es demasiado ancho— sino que le da a cada
 * búsqueda **una sola forma de dirección**:
 *
 * | Búsqueda | Dirección | Índice |
 * |---|---|---|
 * | una zona | `/alquiler/<ciudad>/<zona>` | indexada, canónica |
 * | varias zonas | `/alquiler/<ciudad>?zona=a,b` | `noindex` |
 * | la ciudad entera | `/alquiler/<ciudad>` | indexada, canónica |
 *
 * De ahí sale la regla que este archivo escribe: **la ruta de zona rechaza el
 * parámetro `zona`; la de ciudad es la única que lo admite.** La ubicación
 * nunca aparece dos veces adentro de una misma dirección.
 *
 * Por qué el `noindex` es sólo de la forma combinada: las combinaciones son
 * una pantalla de trabajo, no una de aterrizaje. Con cuatro zonas en Maracaibo
 * son quince direcciones para contenido que ya vive en cinco páginas, y Google
 * lee eso como duplicado — y la búsqueda orgánica es el canal de adquisición
 * de este producto (AGENTS.md §2). Esa mitad ya la resuelve `FILTER_KEYS` de
 * `listing-discovery/domain/zone-route.ts`, que tiene `zona` adentro; acá no
 * se escribe una segunda copia de esa regla.
 *
 * Vive en `domain/` y no en las dos páginas por la regla permanente del
 * fundador, y por la razón mecánica de siempre: el suelo de cobertura del 90 %
 * llega a `src/modules/` y no llega a `app/`, así que la misma regla escrita
 * en `page.tsx` es una regla que ninguna corrida de tests puede poner en rojo
 * — y son DOS páginas, o sea dos copias que empiezan a discrepar.
 */

/** Las dos formas de ruta que una búsqueda puede tener. */
export type SearchRouteKind = "city" | "zone";

/**
 * Lo que se le dice a quien llegó con `?zona=` a una ruta que ya nombra una.
 *
 * **Se ignora con un aviso en vez de romper la página** (14.23b). Un 404 sería
 * castigar a alguien por una dirección vieja pegada en un chat, y aplicarlo a
 * medias —tomarlo para el criterio pero no para el título, o al revés— es el
 * defecto que esa tarea nombra: el visitante ve avisos de un sitio que la
 * pantalla no menciona y no tiene cómo enterarse.
 */
export const ZONE_QUERY_NOT_ALLOWED_NOTICE =
  "Esta dirección ya nombra una zona, así que se ignoró el «zona» que traía. Para buscar en varias a la vez, la dirección es la de la ciudad.";

export interface SearchLocationInput {
  readonly route: SearchRouteKind;
  /** La zona que la ruta afirma. Sólo la ruta de zona la tiene. */
  readonly routeZoneId?: string;
  readonly query: SearchQuery;
  /** Las zonas de `?zona=`, ya resueltas contra el catálogo de esta ciudad. */
  readonly queryZoneIds: readonly string[];
}

export interface SearchLocation {
  /** Las zonas de la búsqueda, combinadas con O (F4). */
  readonly zoneIds: readonly string[];
  /** La query **sin lo que esta ruta no admite**. Es la que compone los enlaces. */
  readonly query: SearchQuery;
  /** Lo que hay que decir en pantalla, o `null`. */
  readonly notice: string | null;
}

/** Sólo la ruta de ciudad, que es la única forma que tiene una búsqueda de varias zonas. */
export function acceptsZoneQuery(route: SearchRouteKind): boolean {
  return route === "city";
}

/**
 * Qué zonas busca esta dirección, con qué query se componen sus enlaces y qué
 * hay que avisar.
 *
 * **Sacar `zona` de la query es la parte que hace que "ignorado" sea verdad.**
 * Dejarlo adentro lo arrastraría a cada enlace que la página compone —la
 * paginación, el filtro de la pastilla, el `callbackUrl` de «Entrar»— porque
 * `buildSearchHref` conserva lo que ya estaba. Un parámetro que viaja y no
 * aplica es un medio-aplicado con otra cara.
 */
export function resolveSearchLocation(input: SearchLocationInput): SearchLocation {
  if (acceptsZoneQuery(input.route)) {
    return { zoneIds: input.queryZoneIds, query: input.query, notice: null };
  }

  const raw = input.query[SEARCH_QUERY_NAMES.zone] ?? "";
  const { [SEARCH_QUERY_NAMES.zone]: _dropped, ...query } = input.query;

  return {
    // La ruta afirma un lugar y es el único: la query no puede ensancharlo ni
    // reemplazarlo. `routeZoneId` ausente sería una ruta de zona sin zona, que
    // `resolveZoneRoute` ya hizo imposible antes de llegar acá.
    zoneIds: input.routeZoneId === undefined ? [] : [input.routeZoneId],
    query,
    // Vacío no es puesto: es lo que deja un formulario `GET` que nadie llenó, y
    // es el mismo criterio que `isFilteredZoneRoute` aplica del otro lado.
    notice: raw.trim() === "" ? null : ZONE_QUERY_NOT_ALLOWED_NOTICE,
  };
}
