import type { RoomStep } from "./room-steps";
import {
  countActiveFilters,
  readSearchStep,
  resolveSearchSteps,
  type SearchSelection,
  type SearchStepId,
  type SearchStepView,
  searchHeadline,
  summariseSearch,
  toSearchSelection,
} from "./search-accordion";
import {
  type RelaxableFilter,
  type ReliefOffer,
  resolveSearchConfirm,
  type SearchConfirm,
} from "./search-confirm";
import type { ListingAttribute, PublisherType, SearchCriteria } from "./search-criteria";
import {
  type AttributeOption,
  narrowZoneOptions,
  type RoomOption,
  resolveAttributeOptions,
  resolveRoomOptions,
  resolveZoneOptions,
  type ZoneOption,
  type ZoneSuggestion,
  zoneIdsFromSuggestions,
} from "./search-options";
import {
  buildSearchHref,
  clearAllHref,
  planCityChange,
  SEARCH_QUERY_NAMES,
  type SearchQuery,
  toggleZone,
} from "./search-query";
import type { SearchZone } from "./zone-catalogue";

/**
 * **El acordeón entero, armado de una sola vez y sin tocar una pantalla.**
 *
 * Cada opción del panel es un enlace o un formulario `GET` (F14), así que
 * "dibujar el panel" es sobre todo **decidir a qué dirección lleva cada
 * opción** — y eso son reglas: qué se borra al cambiar de ciudad, cómo se
 * combinan dos zonas, qué campos se llevan escondidos para no perder la
 * búsqueda al enviar un formulario, adónde vuelve «Limpiar todo». Ninguna de
 * esas decisiones puede vivir en JSX: la regla permanente del fundador lo
 * prohíbe, y el suelo de cobertura del 90 % —que llega a `domain/` y no llega a
 * `components/`— haría que romperlas no pusiera nada en rojo.
 *
 * El componente que consume esto no decide nada. Recibe una lista de opciones
 * con su etiqueta, su conteo, si está elegida, si está deshabilitada y adónde
 * lleva; su único trabajo es escribir el marcado.
 */

/** Los conteos que el panel necesita. Es la forma de `FacetCounts`, sin importarlo. */
export interface PanelCounts {
  readonly total: number;
  readonly byZone: Readonly<Record<string, number>>;
  readonly byMinRooms: Readonly<Record<RoomStep, number>>;
  readonly byAttribute: Readonly<Record<ListingAttribute, number>>;
  readonly byPublisherType: Readonly<Record<PublisherType, number>>;
}

export interface PanelCity {
  readonly id: string;
  readonly name: string;
  /** Su ruta: `/alquiler/maracaibo`. La ciudad vive en el camino, no en la query. */
  readonly path: string;
  /** Su conteo real. F3 lo pide, y la regla transversal 3 lo hace obligatorio. */
  readonly count: number;
}

export interface PanelZone {
  /**
   * **La clave de verdad, y por eso el slug no la reemplaza.** Es lo que indexa
   * `counts.byZone` y lo que viaja a `countFacets`: cambiarla por el slug
   * dejaría cada zona en cero, deshabilitada y sin número.
   */
  readonly id: string;
  readonly name: string;
  /**
   * El nombre legible que viaja en `?zona=` (F12: `?zona=chacao,altamira`). Lo
   * calcula `toSearchZones` en el dominio; la página no lo formatea.
   */
  readonly slug: string;
  /** Su ruta canónica: `/alquiler/distrito-capital/chacao`. */
  readonly path: string;
}

/**
 * Las zonas de UNA ciudad como las pide el panel, con su ruta canónica ya
 * armada sobre el mismo slug que viaja en la query.
 *
 * El recorte por ciudad va acá y no en la página por la razón de siempre: es
 * la garantía de aislamiento del D5, y una regla escrita en `app/` queda fuera
 * del suelo de cobertura del 90 %.
 */
export function toPanelZones(
  cityPath: string,
  zones: readonly SearchZone[],
  cityId: string,
): readonly PanelZone[] {
  return zones
    .filter((zone) => zone.cityId === cityId)
    .map((zone) => ({
      id: zone.id,
      name: zone.name,
      slug: zone.slug,
      // La ruta y la query salen del MISMO slug. Que sean dos derivaciones
      // distintas del nombre es cómo `?zona=` deja de nombrar la zona que la
      // ruta nombra.
      path: `${cityPath}/${zone.slug}`,
    }));
}

export interface SearchPanelInput {
  /** La ruta que se está viendo. Es la que conserva la zona de la ruta, si hay. */
  readonly basePath: string;
  /** La ruta de la ciudad sola. Es adónde vuelve «Limpiar todo». */
  readonly cityPath: string;
  readonly query: SearchQuery;
  readonly cityId: string;
  readonly cities: readonly PanelCity[];
  readonly zones: readonly PanelZone[];
  /** Las zonas elegidas, en el orden en que se eligieron. */
  readonly chosenZoneIds: readonly string[];
  readonly counts: PanelCounts;
  /** Los filtros ya validados. Se leen de acá y no de la query cruda. */
  readonly criteria: Pick<
    SearchCriteria,
    "minPriceUsd" | "maxPriceUsd" | "minRooms" | "publisherType" | "attributes"
  >;
  /**
   * Lo que el vocabulario cerrado reconoció en el texto del buscador. Lo
   * resuelve `suggestFilters` (listing-catalogue) y llega ya calculado: el
   * dominio de la búsqueda no importa el importador de topónimos.
   */
  readonly zoneSuggestions?: readonly ZoneSuggestion[];
  /** La ficha del único resultado, cuando hay exactamente uno (F7). */
  readonly onlyListingHref?: string;
  /**
   * La salida que se ofrece cuando no coincide nada (F7). Llega calculada
   * porque necesita conteos de la base: cuántos habría al soltar cada filtro.
   */
  readonly relief?: ReliefOffer | null;
}

/**
 * **Qué filtros hay puestos, y por lo tanto cuáles se pueden soltar.**
 *
 * Es la lista que la pantalla del vacío consulta: preguntar "¿cuántos habría
 * sin el precio?" cuando nadie puso un precio es un viaje a la base para
 * enterarse de que el total no cambió.
 *
 * El precio cuenta como UNO aunque sean dos números: soltar sólo el mínimo y
 * dejar el máximo es media salida, y ofrecer media salida es ofrecer dos
 * salidas donde la regla pide una.
 */
export function relaxableFilters(
  criteria: SearchPanelInput["criteria"],
  chosenZoneIds: readonly string[],
): readonly RelaxableFilter[] {
  const filters: RelaxableFilter[] = [];
  if (chosenZoneIds.length > 0) filters.push("zone");
  if (criteria.minPriceUsd !== undefined || criteria.maxPriceUsd !== undefined) {
    filters.push("price");
  }
  if (criteria.minRooms !== undefined) filters.push("rooms");
  if (criteria.publisherType !== undefined) filters.push("publisherType");
  for (const attribute of criteria.attributes ?? []) filters.push(attribute);
  return filters;
}

/**
 * El mismo criterio **sin ese filtro**, para preguntarle a la base cuántos
 * habría al soltarlo.
 *
 * **La ciudad sobrevive siempre**, y no porque esta función la respete: no
 * está en la lista de lo que se puede soltar, y `SearchCriteria.cityId` es
 * obligatorio y no nulable. El aislamiento de ciudad no es un filtro que se
 * pueda aflojar para conseguir resultados — ofrecer «quitá Caracas y ver 23»
 * sería mandar a alguien a mirar apartamentos a mil kilómetros.
 */
export function withoutFilter(criteria: SearchCriteria, filter: RelaxableFilter): SearchCriteria {
  const { zoneIds, minPriceUsd, maxPriceUsd, minRooms, publisherType, attributes, ...rest } =
    criteria;

  const keep = <T>(value: T | undefined, dropped: boolean): T | undefined =>
    dropped ? undefined : value;

  return {
    ...rest,
    // El precio se suelta entero: dejar un extremo es media salida, y la regla
    // pide UN cambio, no medio.
    ...maybe("zoneIds", keep(zoneIds, filter === "zone")),
    ...maybe("minPriceUsd", keep(minPriceUsd, filter === "price")),
    ...maybe("maxPriceUsd", keep(maxPriceUsd, filter === "price")),
    ...maybe("minRooms", keep(minRooms, filter === "rooms")),
    ...maybe("publisherType", keep(publisherType, filter === "publisherType")),
    ...maybe("attributes", dropAttribute(attributes, filter)),
  };
}

/** El atributo soltado se cae solo; los otros siguen, porque se combinan con Y. */
function dropAttribute(
  attributes: readonly ListingAttribute[] | undefined,
  filter: RelaxableFilter,
): readonly ListingAttribute[] | undefined {
  if (attributes === undefined) return undefined;
  const kept = attributes.filter((attribute) => attribute !== filter);
  return kept.length === 0 ? undefined : kept;
}

/** Deja los filtros ausentes ausentes, en vez de presentes-y-`undefined`. */
function maybe<K extends string, V>(key: K, value: V | undefined) {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

/**
 * La misma búsqueda **sin ese filtro y sin tocar ningún otro** (F7 y F10: «un
 * solo cambio»).
 *
 * La zona es el único caso que además cambia de ruta: la de la ruta también es
 * un filtro (es lo mismo que decide «Limpiar todo»), así que soltarla devuelve
 * a la ciudad entera y no a la misma dirección con un parámetro menos.
 */
export function reliefHref(
  place: { readonly basePath: string; readonly cityPath: string; readonly query: SearchQuery },
  filter: RelaxableFilter,
): string {
  if (filter === "zone") return buildSearchHref(place.cityPath, place.query, { zone: null });
  if (filter === "price") {
    return buildSearchHref(place.basePath, place.query, { minPrice: null, maxPrice: null });
  }
  if (filter === "rooms") return buildSearchHref(place.basePath, place.query, { minRooms: null });
  if (filter === "publisherType") {
    return buildSearchHref(place.basePath, place.query, { publisherType: null });
  }
  return buildSearchHref(place.basePath, place.query, { [filter]: null });
}

export interface CityChoice {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly chosen: boolean;
  readonly href: string;
  /** Lo que hay que decir antes de tocarla, o `null`. */
  readonly warning: string | null;
}

export type ZoneChoice = ZoneOption & { readonly href: string };
export type RoomChoice = RoomOption & { readonly href: string };
export type AttributeChoice = AttributeOption & { readonly href: string };

export interface PublisherChoice {
  readonly label: string;
  readonly note: string;
  readonly count: number;
  readonly chosen: boolean;
  readonly disabled: boolean;
  readonly href: string;
}

/** Un campo escondido de un formulario `GET`. */
export interface HiddenField {
  readonly name: string;
  readonly value: string;
}

export interface PriceForm {
  readonly action: string;
  readonly hidden: readonly HiddenField[];
  readonly minName: string;
  readonly maxName: string;
  readonly min: string;
  readonly max: string;
}

export interface ZoneSearchForm {
  readonly action: string;
  readonly hidden: readonly HiddenField[];
  readonly name: string;
  readonly value: string;
  /** Se buscó algo y el vocabulario no reconoció ninguna zona. */
  readonly noMatches: boolean;
}

export interface SearchPanelModel {
  readonly steps: readonly SearchStepView[];
  readonly cities: readonly CityChoice[];
  readonly zones: readonly ZoneChoice[];
  readonly zoneSearch: ZoneSearchForm;
  readonly price: PriceForm;
  readonly rooms: readonly RoomChoice[];
  readonly publisher: PublisherChoice;
  readonly attributes: readonly AttributeChoice[];
  readonly clearAllHref: string;
  readonly confirm: SearchConfirm;
  /** «9 avisos · $250 – $700 · 2 hab · dueños». */
  readonly summary: string;
  /** «Chacao, Altamira», o la ciudad si no hay zonas. */
  readonly headline: string;
  /** El número al lado del engranaje. La ciudad no cuenta. */
  readonly activeFilters: number;
}

export function buildSearchPanel(input: SearchPanelInput): SearchPanelModel {
  const { basePath, cityPath, query, counts, criteria } = input;

  const city = input.cities.find((candidate) => candidate.id === input.cityId);
  const chosenZones = input.chosenZoneIds
    .map((id) => input.zones.find((zone) => zone.id === id))
    .filter((zone): zone is PanelZone => zone !== undefined);

  const selection: SearchSelection = toSearchSelection(
    city?.name ?? "",
    chosenZones.map((zone) => zone.name),
    criteria,
  );

  const zoneSearchText = query[SEARCH_QUERY_NAMES.zoneSearch] ?? "";
  const matchedZoneIds = zoneIdsFromSuggestions(input.zoneSuggestions ?? [], zoneSearchText);
  const zoneOptions = narrowZoneOptions(
    resolveZoneOptions(input.zones, counts.byZone, input.chosenZoneIds),
    matchedZoneIds,
  );

  return {
    steps: resolveSearchSteps(selection, readSearchStep(query[SEARCH_QUERY_NAMES.step])),
    cities: input.cities.map((candidate) => toCityChoice(candidate, input, selection)),
    zones: zoneOptions.map((option) => ({
      ...option,
      href: zoneHref(input, option.id),
    })),
    zoneSearch: {
      action: basePath,
      hidden: hiddenFields(query, [SEARCH_QUERY_NAMES.zoneSearch], "zona"),
      name: SEARCH_QUERY_NAMES.zoneSearch,
      value: zoneSearchText,
      noMatches: matchedZoneIds !== null && zoneOptions.length === 0,
    },
    price: {
      action: basePath,
      // La página se cae del formulario, igual que en `buildSearchHref`:
      // cambiar el precio es cambiar de búsqueda, y la página 3 de la anterior
      // no significa nada en la nueva.
      hidden: hiddenFields(
        query,
        [SEARCH_QUERY_NAMES.minPrice, SEARCH_QUERY_NAMES.maxPrice, SEARCH_QUERY_NAMES.page],
        "habitaciones",
      ),
      minName: SEARCH_QUERY_NAMES.minPrice,
      maxName: SEARCH_QUERY_NAMES.maxPrice,
      min: criteria.minPriceUsd === undefined ? "" : String(criteria.minPriceUsd),
      max: criteria.maxPriceUsd === undefined ? "" : String(criteria.maxPriceUsd),
    },
    rooms: resolveRoomOptions(counts.byMinRooms, criteria.minRooms).map((option) => ({
      ...option,
      href: buildSearchHref(basePath, query, {
        minRooms: option.nextValue,
        step: "habitaciones",
      }),
    })),
    publisher: toPublisherChoice(input),
    attributes: resolveAttributeOptions(
      counts.byAttribute,
      counts.total,
      criteria.attributes ?? [],
    ).map((option) => ({
      ...option,
      href: buildSearchHref(basePath, query, {
        [option.attribute]: option.nextValue,
        step: "habitaciones",
      }),
    })),
    clearAllHref: clearAllHref(cityPath, query),
    // Confirmar **cierra el acordeón y nada más**: los filtros ya están en la
    // dirección desde que se tocaron, así que este botón no aplica nada — dice
    // cuántos hay y lleva a verlos.
    confirm: resolveSearchConfirm({
      total: counts.total,
      resultsHref: buildSearchHref(basePath, query, { step: null }),
      ...(input.onlyListingHref === undefined ? {} : { onlyListingHref: input.onlyListingHref }),
      relief: input.relief ?? null,
    }),
    summary: summariseSearch(selection, counts.total),
    headline: searchHeadline(selection),
    activeFilters: countActiveFilters(selection),
  };
}

function toCityChoice(
  candidate: PanelCity,
  input: SearchPanelInput,
  selection: SearchSelection,
): CityChoice {
  const chosen = candidate.id === input.cityId;
  // Quedarse donde se está no pierde nada, así que no hay nada que avisar.
  const plan = planCityChange(
    { path: candidate.path, name: candidate.name },
    input.query,
    chosen ? [] : selection.zoneNames,
    { step: "zona" },
  );

  return {
    id: candidate.id,
    name: candidate.name,
    count: candidate.count,
    chosen,
    href: plan.href,
    warning: plan.warning,
  };
}

/**
 * **Adónde lleva tocar una zona, y por qué la ruta cambia de forma.**
 *
 * Una zona sola tiene ruta propia y se indexa: `/alquiler/dc/chacao`. Dos no
 * pueden tenerla —no existe la ruta de "Chacao o Altamira"— así que caen en la
 * ciudad con la lista en la query. La regla se escribe una vez acá para que la
 * dirección canónica sobreviva a la selección múltiple en vez de perderse en
 * cuanto alguien toca la segunda zona.
 *
 * Lo exporta para la salida «Agregar Norte y ver 12» de `search-exits.ts`:
 * sumar una zona desde el vacío es exactamente tocar esa zona en el panel, y
 * una segunda copia de esta regla daría dos direcciones distintas para la misma
 * acción — una indexable y la otra no.
 */
export function zoneHref(
  input: Pick<SearchPanelInput, "cityPath" | "query" | "zones" | "chosenZoneIds">,
  zoneId: string,
): string {
  const next = toggleZone(input.chosenZoneIds, zoneId);

  if (next.length === 1) {
    const only = input.zones.find((zone) => zone.id === next[0]);
    if (only) return buildSearchHref(only.path, input.query, { zone: null, step: "zona" });
  }

  return buildSearchHref(input.cityPath, input.query, {
    zone: zoneParam(input.zones, next),
    step: "zona",
  });
}

/**
 * **El valor de `?zona=`: slugs, no ids.**
 *
 * La dirección es el estado de la búsqueda y se pega en un chat, así que tiene
 * que poder leerse: `?zona=chacao,altamira` y no dos hashes de treinta y seis
 * caracteres (F12). Adentro se sigue trabajando con ids —son la clave de
 * `byZone` y lo que recibe `countFacets`—; el slug es sólo cómo se escribe.
 *
 * Un id que este catálogo de ciudad no nombra viaja tal cual antes que
 * desaparecer: perder una zona elegida es devolver una búsqueda más ancha que
 * la pedida, y eso el visitante lo ve como resultados de más sin causa.
 */
function zoneParam(zones: readonly PanelZone[], zoneIds: readonly string[]): string | null {
  if (zoneIds.length === 0) return null;

  return zoneIds.map((id) => zones.find((zone) => zone.id === id)?.slug ?? id).join(",");
}

function toPublisherChoice(input: SearchPanelInput): PublisherChoice {
  const chosen = input.criteria.publisherType === "owner";
  const count = input.counts.byPublisherType.owner;

  return {
    label: "Sólo de dueños",
    note: "sin inmobiliaria en el medio",
    count,
    chosen,
    disabled: count === 0 && !chosen,
    href: buildSearchHref(input.basePath, input.query, {
      publisherType: chosen ? null : "owner",
      step: "habitaciones",
    }),
  };
}

/**
 * Todo el estado actual como campos escondidos, **menos los que el formulario
 * manda por su cuenta**.
 *
 * Un `<form method="get">` reemplaza la query entera por sus propios campos:
 * sin esto, enviar el precio borraría las zonas, las habitaciones y los
 * atributos que ya estaban puestos. Y el campo que el formulario sí manda no
 * puede ir además escondido, porque entonces viajaría dos veces y ganaría el
 * viejo.
 */
function hiddenFields(
  query: SearchQuery,
  owned: readonly string[],
  step: SearchStepId,
): readonly HiddenField[] {
  const fields: HiddenField[] = [];
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    if (owned.includes(name) || name === SEARCH_QUERY_NAMES.step) continue;
    fields.push({ name, value });
  }
  // El acordeón queda donde corresponde después de enviar: sin JavaScript el
  // navegador no puede recordar qué sección estaba abierta.
  fields.push({ name: SEARCH_QUERY_NAMES.step, value: step });
  return fields;
}
