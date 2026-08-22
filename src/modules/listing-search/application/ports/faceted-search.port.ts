import type { PropertyType } from "../../../../shared/db/schema";
import type { RoomStep } from "../../domain/room-steps";
import type { ListingAttribute, PublisherType, SearchCriteria } from "../../domain/search-criteria";

/**
 * The numbers every filter option shows before anybody picks it (tasks.md
 * 14.11 — "the heaviest requirement in the entire document").
 *
 * The founder's cross-cutting rule 3 is the whole contract: **"todo conteo es
 * real. Si una etiqueta dice 9, hay 9."** F3, F4, F6 and F7 all rest on it —
 * every option carries its count, and the confirm button states the exact
 * result count at each step ("Ver 47 avisos" → "Ver 21" → "Ver 16" → "Ver 9").
 * A count that comes from anywhere other than the rows themselves is a number
 * that can lie without anyone noticing, which is why this port has no cache
 * and no estimate in its shape.
 *
 * **`criteria` is the same `SearchCriteria` the row query takes, deliberately.**
 * It is not a parallel type that happens to look similar: sharing it is what
 * makes "the button says 9" and "the list has 9 rows" the same question asked
 * of the same filter set. It also inherits D5 whole — `cityId` is required and
 * non-nullable, so a faceted count with no city is not expressible here either,
 * and there is no wildcard to pass.
 *
 * **Status is absent for the same reason it is absent from `ListingSearchPort`**
 * (tasks.md 5.5/5.6): expired and auto-hidden adverts are in no count, and
 * making that a criterion would put "include the expired ones" one word away
 * from a number the product promises is real.
 *
 * STATED AT ITS REAL STRENGTH: these are properties of this interface's shape,
 * not of the runtime. Nothing here forces an adapter to honour them, which is
 * why tests/integration/faceted-search.test.ts asserts against real Postgres
 * rows and compares every total against what `ListingSearchPort.search`
 * actually returns.
 */

/**
 * Los tres vocabularios de abajo **los define el dominio y este puerto los
 * reexporta**, no los declara (tasks 14.6 a 14.9).
 *
 * Eran tres tipos escritos acá que casualmente coincidían con los filtros. Al
 * volverse criterios de verdad, una segunda declaración sería una copia libre
 * de derivar: una faceta que cuenta `RoomStep` 1-4 mientras el control ofrece
 * cinco escalones es un número que miente sin que nada se ponga rojo. Que sean
 * *el mismo* tipo es lo que hace que "la etiqueta dice 9" y "la lista trae 9"
 * sigan siendo la misma pregunta.
 *
 * `RoomStep` sigue significando **4 es "cuatro o más"**, porque es el mismo
 * filtro que `SearchCriteria.minRooms`. Un histograma de cuartos exactos
 * daría un número distinto del que la opción produce, y la regla 3 no permite
 * que la etiqueta y el resultado discrepen.
 */
export type { RoomStep } from "../../domain/room-steps";
export type { ListingAttribute, PublisherType } from "../../domain/search-criteria";

export interface FacetCounts {
  /**
   * What the confirm button says (F7). Equal, by construction, to the number
   * of rows `ListingSearchPort.search(criteria)` can reach — the integration
   * test asserts exactly that rather than a hand-written constant.
   *
   * **`criteria.page` no lo toca, y ésa es toda su relación con la
   * paginación** (task 14.10): un conteo es sobre la búsqueda entera, no
   * sobre la pantalla que se está viendo. Es justamente lo que deja saber
   * cuántas páginas hay — un total que se recortara al `LIMIT` daría siempre
   * "una sola página" y el botón diría 24 sobre 300 avisos.
   */
  readonly total: number;
  /**
   * Keyed by zone id, and **a zone with nothing in it is present with a zero
   * rather than missing** (cross-cutting rule 4: "ninguna opción lleva a un
   * vacío"). An absent key would leave the screen unable to tell "there are
   * none" from "I never asked", and telling those apart is precisely what
   * rule 4 asks it to show. What the screen then *renders* is a separate
   * decision the founder already made (tasks.md 17.6: a zone with none shows
   * no number at all, not a "0") — that is a rendering rule, and it needs the
   * zero to exist in order to obey it.
   */
  readonly byZone: Readonly<Record<string, number>>;
  /** How many results each step of the rooms control would produce. */
  readonly byMinRooms: Readonly<Record<RoomStep, number>>;
  readonly byAttribute: Readonly<Record<ListingAttribute, number>>;
  readonly byPropertyType: Readonly<Record<PropertyType, number>>;
  readonly byPublisherType: Readonly<Record<PublisherType, number>>;
}

export interface FacetedSearchPort {
  /**
   * **A facet is counted against the OTHER facets, never against itself**, and
   * this is the rule that decides whether the filter is usable at all. With
   * "3 habitaciones" already chosen, the zone counts must reflect it — but the
   * count beside "2 habitaciones" must say how many there would be *if the
   * visitor switched to 2*, not zero. An engine that applies every filter to
   * every count switches off every option except the one already selected, and
   * changing your mind starts to look impossible.
   *
   * `offeredZoneIds` are the zone options the caller is about to render, and
   * they are required rather than derived. The taxonomy is a tree of thousands
   * of rows per city (see `zone` in the schema), so "every zone of the city"
   * is not a list anybody wants counted; the honest question is "the options I
   * am showing". Every id passed gets an entry — zero included — and zones
   * outside the list still appear when they hold matches, so `byZone` never
   * hides supply from the caller either.
   *
   * A zone id belonging to another city is not an error and is not special-
   * cased: it comes back as zero, because the count belongs to the city in
   * `criteria` and not to the id it was handed (D5).
   */
  countFacets(criteria: SearchCriteria, offeredZoneIds: readonly string[]): Promise<FacetCounts>;
}
