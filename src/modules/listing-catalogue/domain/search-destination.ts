import { HOME_SEARCH_LABEL } from "../../listing-discovery/domain/home-collections";
import { slugify } from "../../listing-discovery/domain/listing-url";
import type { SearchQueryChanges } from "../../listing-search/domain/search-query";
import { buildSearchHref } from "../../listing-search/domain/search-query";
import {
  type FilterSuggestion,
  type SuggestionVocabulary,
  suggestFilters,
} from "./suggest-filters";

/**
 * A dónde lleva lo que alguien escribió en la caja del inicio.
 *
 * ## Por qué esto vive en el dominio y no en la página
 *
 * Es la regla permanente del fundador: **una regla de negocio nunca vive en el
 * frente**. Acá se decide qué cuenta como un lugar, cuándo hay uno solo y
 * cuándo hay que preguntar, qué filtros viajan pegados y cuál es la dirección
 * canónica resultante. La página traduce HTTP y dibuja. También hay una razón
 * mecánica: el suelo de cobertura del 90 % llega a `domain/` y no llega a `app/`,
 * así que una regla escrita en la página es una regla que ninguna corrida de
 * tests puede poner en rojo.
 *
 * ## Sin JavaScript, y eso NO es una degradación
 *
 * F14. La caja es un `<form method="get">` que vuelve al inicio con `?q=`. El
 * servidor traduce con esta función y **redirige a la dirección filtrada
 * canónica**; cuando lo escrito nombra más de un lugar, el inicio dibuja los
 * enlaces para elegir. Las dos cosas pasan en el servidor, así que el mecanismo
 * entero anda con el script apagado. Sugerir mientras se escribe sería una
 * mejora encima de esto, nunca el mecanismo.
 *
 * ## Por qué no hay una ruta `/buscar`
 *
 * La 14.24 la borró: toda búsqueda lleva un `cityId` obligatorio, así que toda
 * búsqueda posible cae en la ruta de su lugar. Traducir en el inicio y redirigir
 * mantiene esa decisión intacta — no se agrega una segunda dirección para la
 * misma página, que es contenido duplicado, y no hay una pantalla intermedia que
 * indexar.
 *
 * ## El lugar es obligatorio, y eso es la garantía de aislamiento
 *
 * `ListingSearchPort` exige un `cityId` a nivel de tipo. Por eso escribir sólo
 * «apartamento amoblado» no puede producir una dirección: no hay búsqueda sin
 * lugar. La salida honesta no es un error — es ofrecer las ciudades del producto
 * con los filtros ya puestos, que es otra vez un par (filtro, valor).
 */

/** El parámetro con el que la caja del inicio devuelve lo escrito. */
export const HOME_SEARCH_PARAM = "q";

/** Lo que dice el botón. Es producto, así que no se escribe en el componente. */
export const HOME_SEARCH_SUBMIT_LABEL = "Buscar";

/** Cómo se anuncia la lista de opciones a quien navega con lector de pantalla. */
export const HOME_SEARCH_RESULTS_LABEL = "Resultados de la búsqueda";

/**
 * **«No entendí», nunca «no hay avisos».**
 *
 * Acá no se leen títulos ni descripciones de avisos, así que la falta de oferta
 * no puede producir este mensaje. Decir «sin resultados» le echaría la culpa al
 * catálogo por una palabra que el vocabulario no tiene, que es exactamente el
 * error que la exclusión de «búsqueda de texto libre» quería evitar.
 *
 * Vive en el dominio y no en la página por la misma razón que
 * `HOME_SEARCH_LABEL`: es lo que el producto le contesta a quien llega, no una
 * cadena de maquetado.
 */
export function noMatchMessage(typed: string): string {
  return `No reconocimos «${typed.trim()}». Probá con una zona, una ciudad o un tipo de vivienda.`;
}

/** Lo que la caja necesita para dibujarse, ya resuelto. */
export interface HomeSearchForm {
  readonly label: string;
  /** A dónde vuelve el `GET`: al inicio, que es quien traduce y redirige. */
  readonly action: string;
  readonly name: string;
  readonly value: string;
  readonly submitLabel: string;
}

/**
 * **Una opción es un par (filtro, valor), nunca una palabra.**
 *
 * `Centro` existe en Maracaibo y en Distrito Capital. Ofrecer sólo «Centro»
 * aplicaría el filtro de la ciudad equivocada y devolvería cero avisos sin que
 * nadie entienda por qué — el aislamiento de ciudad es una garantía dura de la
 * base, no un filtro que se pueda aflojar. Por eso cada opción lleva su `scope`
 * **con la ciudad adentro**: la parroquia sola («Catedral») no dice de qué
 * ciudad se habla, y es justo lo que hay que distinguir.
 */
export interface SearchChoice {
  readonly label: string;
  readonly scope: string;
  readonly href: string;
  /**
   * Cuántos avisos hay del otro lado, **tal como se dibuja**, o `null` para no
   * dibujar ninguno (14.51).
   *
   * `null` cuando quien armó el vocabulario no contó —el camino del servidor,
   * que estrecha con `ILIKE` y no cuenta— y también cuando contó cero: un «0»
   * pegado a una opción se lee como un conteo roto, que es la misma regla que
   * `resolveZoneOptions` ya tomó para el panel de filtros.
   */
  readonly countLabel: string | null;
}

export type SearchDestination =
  /** Un solo lugar: se redirige y no se pregunta nada. */
  | { readonly kind: "route"; readonly href: string }
  /** Más de uno, o filtros sin lugar: se pregunta, con los filtros ya puestos. */
  | { readonly kind: "choices"; readonly options: readonly SearchChoice[] }
  /**
   * No coincidió con el vocabulario. Significa «no entendí», **nunca «no hay
   * avisos»**: acá no se leen títulos ni descripciones, así que la falta de
   * oferta no puede producir esta respuesta.
   */
  | { readonly kind: "unknown" };

/** El artboard dibuja cuatro; ocho deja aire sin volverse un índice. */
const DEFAULT_LIMIT = 8;

export function homeSearchForm(typed?: string | null): HomeSearchForm {
  return {
    // Llega del dominio de descubrimiento, que es donde el inicio guarda lo que
    // le pregunta a quien llega. Escribirlo de nuevo sería una segunda copia.
    label: HOME_SEARCH_LABEL,
    action: "/",
    name: HOME_SEARCH_PARAM,
    // Devolver lo escrito es lo que hace que el campo no quede vacío al volver
    // del servidor: sin JavaScript el navegador no puede recordarlo por su
    // cuenta, y perder el texto en cada intento es lo que hace que alguien
    // abandone.
    value: (typed ?? "").trim(),
    submitLabel: HOME_SEARCH_SUBMIT_LABEL,
  };
}

/**
 * Los filtros de la misma frase, con los nombres del dominio de búsqueda.
 *
 * Se arma un `SearchQueryChanges` y no una cadena: `buildSearchHref` es quien
 * conoce los nombres cortos del fundador (`max`, `hab`, `tipo`, …) y su orden.
 * Pegar `?tipo=` acá sería una segunda copia de ese contrato, y una dirección
 * pegada en un WhatsApp hace meses tiene que seguir significando lo mismo.
 */
function filtersOf(suggestions: readonly FilterSuggestion[]): SearchQueryChanges {
  const changes: Record<string, string> = {};

  // **Gana la primera, con `??=`.** `suggestFilters` emite en un orden
  // deliberado, y dejar que la última pisara a la anterior significaba que una
  // frase con dos señales del mismo filtro se quedaba con la menos específica.
  for (const suggestion of suggestions) {
    if (suggestion.kind === "propertyType") changes.propertyType ??= suggestion.id;
    if (suggestion.kind === "maxPrice") changes.maxPrice ??= suggestion.id;
    if (suggestion.kind === "rooms") changes.minRooms ??= suggestion.id;
    if (suggestion.kind === "publisherType") changes.publisherType ??= suggestion.id;
    // `1` y no `true`: es el único valor que `readFlag` acepta junto con `on`, y
    // los cinco atributos sólo se pueden pedir en positivo.
    if (suggestion.kind === "feature") changes[suggestion.id] ??= "1";
  }

  return changes as SearchQueryChanges;
}

/**
 * **Las opciones, en forma de lista y sin colapsar** (14.51).
 *
 * `resolveSearchDestination` colapsa una sola opción a una redirección, que es
 * lo correcto cuando alguien ya envió el formulario. El panel de sugerencias
 * necesita lo contrario: con una sola coincidencia sigue habiendo algo que
 * dibujar, y `route` lleva la dirección sin la etiqueta.
 *
 * Sacarla afuera es lo que hace que **la misma función alimente las dos
 * partes** — el servidor al enviar y el panel al escribir, sobre el mismo
 * `suggestFilters` y el mismo armado de dirección. Una segunda copia en el
 * cliente es exactamente lo que la 14.35 y la 14.51 prohíben, y es cómo «la
 * etiqueta dice 9» y «la lista trae 9» dejan de ser la misma pregunta.
 */
export function searchChoices(
  text: string,
  vocabulary: SuggestionVocabulary,
  limit: number = DEFAULT_LIMIT,
): readonly SearchChoice[] {
  const suggestions = suggestFilters(text, vocabulary);
  if (suggestions.length === 0) return [];

  const cityById = new Map(vocabulary.cities.map((city) => [city.id, city]));
  const zoneById = new Map(vocabulary.zones.map((zone) => [zone.id, zone]));
  const filters = filtersOf(suggestions);

  const options: SearchChoice[] = [];
  const seen = new Set<string>();
  const zoneCityIds = new Set<string>();

  const add = (
    label: string,
    scope: string,
    basePath: string,
    // Cero y "no sé" se dibujan igual —sin número— y por la misma razón que en
    // `resolveZoneOptions`: un «0» pegado a una opción se lee como un conteo
    // roto, y `undefined` no es un número que se pueda escribir.
    count?: number,
  ): void => {
    if (seen.has(basePath) || options.length >= limit) return;
    seen.add(basePath);
    options.push({
      label,
      scope,
      href: buildSearchHref(basePath, {}, filters),
      countLabel: count === undefined || count === 0 ? null : String(count),
    });
  };

  /**
   * **17.7 — la oferta real decide qué se ofrece, y una zona en cero no es una
   * opción.** `suggestFilters` traduce texto a candidatos sin mirar cuánta
   * oferta tienen; acá es donde se decide qué zona llega a ser un enlace, y
   * ofrecer una en cero manda a una pantalla sin salida (regla transversal 4)
   * — la misma razón por la que `boundedVocabularyOf` ya la excluye del lado
   * del panel. `undefined` (nadie contó) sigue pasando: significa "no sé", no
   * "no hay", y esta caja siempre cuenta desde 17.5/17.7 salvo que un
   * vocabulario de prueba deje el campo afuera a propósito.
   *
   * **17.5 — ordenadas por oferta, de mayor a menor.** Es el catálogo el que
   * decide qué zona sube, no el orden en que el vocabulario las trajo: sin
   * esto, una taxonomía de 5.796 filas ofrecería zonas al azar en vez de las
   * que de verdad tienen movimiento. `??` con `0` es seguro acá porque un
   * conteo sabido en cero ya se filtró arriba — lo que compite en el orden es
   * "sabido y con oferta" contra "no sé", y lo no sabido queda al final.
   */
  interface ZoneMatch {
    readonly suggestion: FilterSuggestion;
    readonly zone: SuggestionVocabulary["zones"][number];
    readonly city: { readonly id: string; readonly name: string };
  }

  const zoneMatches: ZoneMatch[] = suggestions
    .filter((suggestion) => suggestion.kind === "zone")
    .map((suggestion) => {
      const zone = zoneById.get(suggestion.id);
      return { suggestion, zone, city: zone ? cityById.get(zone.cityId) : undefined };
    })
    .filter(
      (entry): entry is ZoneMatch =>
        // Una zona cuya ciudad no está curada no tiene ruta que resolver:
        // `/alquiler/<nada>/<zona>` es un enlace roto, y este repositorio ya
        // se negó a publicar uno dos veces.
        entry.zone !== undefined && entry.city !== undefined && entry.zone.count !== 0,
    )
    .sort((a, b) => (b.zone.count ?? 0) - (a.zone.count ?? 0));

  for (const { suggestion, zone, city } of zoneMatches) {
    zoneCityIds.add(city.id);
    add(
      // La etiqueta es la de la sugerencia — puede ser el ALIAS, que es el
      // nombre por el que la gente busca. La RUTA, en cambio, se arma con el
      // nombre curado: `resolveZoneRoute` compara contra `slugify(zone.name)`,
      // así que un slug hecho del alias devolvería 404.
      suggestion.label,
      // La parroquia sola no desambigua entre ciudades, que es exactamente lo
      // que hay que distinguir. Sin parroquia declarada va sólo la ciudad: un
      // « · » colgando se lee como un dato que faltó cargar.
      zone.parentName ? `${zone.parentName} · ${city.name}` : city.name,
      `/alquiler/${slugify(city.name)}/${slugify(zone.name)}`,
      // **El conteo es de la ZONA y nunca de la ciudad**: la ciudad no tiene un
      // conteo por zona que contar, y escribirle uno sería inventar un número
      // que nadie mandó — la misma negativa que `search-preview.ts` ya toma con
      // el precio.
      zone.count,
    );
  }

  for (const suggestion of suggestions) {
    if (suggestion.kind !== "city") continue;

    const city = cityById.get(suggestion.id);
    // La ciudad que una zona encontrada ya implica no agrega una opción:
    // ofrecer «Distrito Capital» cuando ya se nombró Altamira es la misma
    // búsqueda más ancha, y convierte un destino claro en una pregunta.
    if (!city || zoneCityIds.has(city.id)) continue;

    add(city.name, city.name, `/alquiler/${slugify(city.name)}`);
  }

  // Filtros sin lugar. No hay búsqueda posible sin ciudad, así que se ofrecen
  // las del producto con los filtros ya aplicados en vez de contestar «no».
  if (options.length === 0 && Object.keys(filters).length > 0) {
    for (const city of vocabulary.cities) {
      add(city.name, city.name, `/alquiler/${slugify(city.name)}`);
    }
  }

  return options;
}

export function resolveSearchDestination(
  text: string,
  vocabulary: SuggestionVocabulary,
  limit: number = DEFAULT_LIMIT,
): SearchDestination {
  const options = searchChoices(text, vocabulary, limit);

  if (options.length === 0) return { kind: "unknown" };
  if (options.length === 1 && options[0]) return { kind: "route", href: options[0].href };

  return { kind: "choices", options };
}
