import type { RoomStep } from "./room-steps";
import {
  countActiveFilters,
  countPillFilters,
  describeFilter,
  resolveFilterPanel,
  resolveSearchSteps,
  type SearchSelection,
  type SearchStepId,
  type SearchStepView,
  searchHeadline,
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
  type RoomOption,
  resolveAttributeOptions,
  resolveRoomOptions,
  resolveZoneOptions,
  type ZoneOption,
} from "./search-options";
import { type PreviewChange, previewConfirmLabel } from "./search-preview";
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
  /**
   * Cuántos quedarían soltando ese filtro y ningún otro (F10 y F11).
   *
   * **Ya viajaban**: `FacetCounts` los trae desde la 14.11 y `buildFilterPanel`
   * pasa ese mismo objeto entero. Declararlos acá no agrega una consulta — le
   * da nombre a la mitad del conteo en vivo que faltaba (14.34), la de quitar.
   */
  readonly withoutFilter: Readonly<Record<RelaxableFilter, number>>;
  /** La ciudad sin un solo filtro del panel: el número de «Limpiar todo». */
  readonly cityTotal: number;
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

/**
 * **Qué va a decir el botón en cuanto se toque esta opción** (14.34), o `null`
 * cuando el número no viajó con la página o la opción no se puede tocar.
 *
 * Va en el modelo y no se deriva en el componente por la regla permanente del
 * fundador: qué conteo corresponde a qué opción es producto, y escrito en un
 * `"use client"` quedaría fuera del suelo de cobertura del 90 %.
 */
interface Previewable {
  readonly previewLabel: string | null;
}

export type RoomChoice = RoomOption & Previewable & { readonly href: string };
export type AttributeChoice = AttributeOption & Previewable & { readonly href: string };

export interface PublisherChoice extends Previewable {
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

/**
 * **Un filtro puesto, con la dirección que lo saca** (lámina 7c).
 *
 * Con la barra lateral afuera, la pantalla de resultados se quedaba sin decir
 * qué está filtrando: la `SearchSummaryBar` se fue en la 14.41 y `panel.summary`
 * no lo dibuja nadie. Estas fichas lo dicen, y además se sacan de a una **sin
 * abrir el panel** — que es lo que la lámina anota al lado.
 */
export interface FilterChip {
  /** Cómo se lee — «Chacao», «Hasta $700», «2 hab». */
  readonly label: string;
  readonly removeHref: string;
  /** «Quitar Chacao». Un «×» solo no se lee en voz alta. */
  readonly removeLabel: string;
}

/** Un grupo del panel, con la dirección que lo abre. */
export type SearchStepChoice = SearchStepView & { readonly href: string };

export interface SearchPanelModel {
  readonly steps: readonly SearchStepChoice[];
  /**
   * Si el panel se dibuja, y por qué. **Lo decide la dirección** (14.33): al
   * perder la barra lateral, los filtros llegan sólo por el control de la
   * pastilla, que es la misma URL con el panel abierto desde el servidor.
   */
  readonly open: boolean;
  /** Lo que hay que decir cuando la dirección pidió un grupo que ya no existe. */
  readonly openNotice: string | null;
  /** El «×» de la lámina: la misma búsqueda sin el panel, sin tocar un filtro. */
  readonly closeHref: string;
  /** Las fichas quitables de la lámina 7c, en el orden en que se leen. */
  readonly chips: readonly FilterChip[];
  readonly cities: readonly CityChoice[];
  readonly zones: readonly ZoneChoice[];
  readonly price: PriceForm;
  readonly rooms: readonly RoomChoice[];
  readonly publisher: PublisherChoice;
  readonly attributes: readonly AttributeChoice[];
  readonly clearAllHref: string;
  /** Lo que dirá el botón al limpiar: la ciudad entera, que no es un filtro. */
  readonly clearAllPreviewLabel: string | null;
  readonly confirm: SearchConfirm;
  /** «Chacao, Altamira», o la ciudad si no hay zonas. */
  readonly headline: string;
  /** El número al lado del engranaje. La ciudad no cuenta. */
  readonly activeFilters: number;
  /**
   * El número que dice la pastilla («3 filtros», 14i). **La zona tampoco
   * cuenta acá**: el filtro de la pastilla abre precio, tamaño, quién publica
   * y atributos, y la ubicación la resuelve el texto. Va en el modelo y no se
   * deriva en la pantalla, porque una resta escrita en `app/` es una regla que
   * ninguna corrida de tests puede poner en rojo.
   */
  readonly pillFilters: number;
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

  // **Ya no se achica por lo escrito** (14.44). El buscador de zona del panel
  // se fue con el paso de ubicación: la zona la resuelve el texto de la
  // pastilla y la ruta, que es donde vive ese dato desde la resolución del
  // fundador. Sin ese formulario no hay nada que estrechar, así que las
  // opciones son las del conteo y punto.
  const zoneOptions = resolveZoneOptions(input.zones, counts.byZone, input.chosenZoneIds);

  const panel = resolveFilterPanel(query[SEARCH_QUERY_NAMES.step]);
  // Una sola vez, y las dos salidas del panel la usan: el «×» de arriba y el
  // botón de abajo cierran lo mismo, y dos expresiones iguales escritas por
  // separado son dos que se separan en el próximo cambio.
  const closeHref = buildSearchHref(basePath, query, { step: null });

  return {
    // La dirección de cada grupo la arma el dominio y no el componente: el
    // punto de quiebre decide si se ven los cuatro a la vez, pero la dirección
    // que abre uno es la misma en 360 y en 1280.
    steps: resolveSearchSteps(selection, panel.step).map((step) => ({
      ...step,
      href: buildSearchHref(basePath, query, { step: step.id }),
    })),
    open: panel.open,
    openNotice: panel.notice,
    closeHref,
    chips: filterChips(input, selection),
    cities: input.cities.map((candidate) => toCityChoice(candidate, input, selection)),
    zones: zoneOptions.map((option) => ({
      ...option,
      href: zoneHref(input, option.id),
    })),
    price: {
      action: basePath,
      // La página se cae del formulario, igual que en `buildSearchHref`:
      // cambiar el precio es cambiar de búsqueda, y la página 3 de la anterior
      // no significa nada en la nueva.
      hidden: hiddenFields(
        query,
        [SEARCH_QUERY_NAMES.minPrice, SEARCH_QUERY_NAMES.maxPrice, SEARCH_QUERY_NAMES.page],
        "precio",
      ),
      minName: SEARCH_QUERY_NAMES.minPrice,
      maxName: SEARCH_QUERY_NAMES.maxPrice,
      min: criteria.minPriceUsd === undefined ? "" : String(criteria.minPriceUsd),
      max: criteria.maxPriceUsd === undefined ? "" : String(criteria.maxPriceUsd),
    },
    rooms: resolveRoomOptions(counts.byMinRooms, criteria.minRooms).map((option) => ({
      ...option,
      previewLabel: preview(counts, option.disabled, {
        kind: "rooms",
        step: option.nextValue === null ? null : option.step,
      }),
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
      previewLabel: preview(counts, option.disabled, {
        kind: "attribute",
        attribute: option.attribute,
        add: option.nextValue !== null,
      }),
      href: buildSearchHref(basePath, query, {
        [option.attribute]: option.nextValue,
        // Cada opción devuelve a SU grupo: saltar a otro después de tocar una
        // casilla es perder de vista lo que se acaba de elegir.
        step: "atributos",
      }),
    })),
    clearAllHref: clearAllHref(cityPath, query),
    clearAllPreviewLabel: preview(counts, false, { kind: "clearAll" }),
    // Confirmar **cierra el acordeón y nada más**: los filtros ya están en la
    // dirección desde que se tocaron, así que este botón no aplica nada — dice
    // cuántos hay y lleva a verlos.
    confirm: resolveSearchConfirm({
      total: counts.total,
      resultsHref: closeHref,
      ...(input.onlyListingHref === undefined ? {} : { onlyListingHref: input.onlyListingHref }),
      relief: input.relief ?? null,
    }),
    headline: searchHeadline(selection),
    activeFilters: countActiveFilters(selection),
    pillFilters: countPillFilters(selection),
  };
}

/**
 * **Las fichas de la lámina 7c, en el orden en que se leen.**
 *
 * Las zonas primero y **una por zona**, que es la diferencia con
 * `describeFilter`: ése las nombra juntas —«Chacao, Altamira»— porque para
 * soltarlas la salida del vacío las suelta todas, y acá hay que poder quitar
 * Chacao dejando Altamira viva. Por eso la zona sale por `zoneHref`, que además
 * devuelve la ruta canónica cuando queda una sola, y los demás por
 * `reliefHref`, que es la misma dirección que ya usa la pantalla del vacío.
 *
 * El vocabulario es el de `describeFilter` y no uno nuevo: un filtro que se
 * llama distinto según dónde se lo mire obliga a adivinar de cuál habla cada
 * pantalla, y eso ya está escrito como razón al lado de esa función.
 */
function filterChips(input: SearchPanelInput, selection: SearchSelection): readonly FilterChip[] {
  const chips: FilterChip[] = [];

  for (const zoneId of input.chosenZoneIds) {
    const zone = input.zones.find((candidate) => candidate.id === zoneId);
    if (!zone) continue;
    chips.push(chip(zone.name, zoneHref(input, zoneId)));
  }

  for (const filter of relaxableFilters(input.criteria, input.chosenZoneIds)) {
    // La zona ya salió arriba, de a una. Acá volvería como un solo bloque.
    if (filter === "zone") continue;
    chips.push(chip(describeFilter(selection, filter), reliefHref(input, filter)));
  }

  return chips;
}

function chip(label: string, removeHref: string): FilterChip {
  return { label, removeHref, removeLabel: `Quitar ${label}` };
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
    if (only) return buildSearchHref(only.path, input.query, { zone: null });
  }

  return buildSearchHref(input.cityPath, input.query, {
    zone: zoneParam(input.zones, next),
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
    previewLabel: preview(input.counts, count === 0 && !chosen, {
      kind: "publisher",
      value: chosen ? null : "owner",
    }),
    href: buildSearchHref(input.basePath, input.query, {
      publisherType: chosen ? null : "owner",
      step: "publica",
    }),
  };
}

/**
 * **Una opción apagada no adelanta nada.** Se dibuja como un `<span>` sin
 * dirección, así que un número al lado prometería una interacción que no
 * existe — y llevaría a la pantalla vacía que la regla transversal 4 prohíbe.
 */
function preview(counts: PanelCounts, disabled: boolean, change: PreviewChange): string | null {
  return disabled ? null : previewConfirmLabel(counts, change);
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
