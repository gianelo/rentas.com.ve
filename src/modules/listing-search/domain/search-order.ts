import { buildSearchHref, SEARCH_QUERY_NAMES, type SearchQuery } from "./search-query";

/**
 * **En qué orden sale la lista** (14.47, decisión del fundador del 2026-09-03).
 *
 * Tres opciones y ni una más: «Recientes» —la de por defecto—, «Precio: menor a
 * mayor» y «Precio: mayor a menor».
 *
 * **«Recientes» sigue de por defecto, y ahora como decisión y no como inercia.**
 * La razón es del catálogo: un aviso viejo en un mercado de alquileres suele
 * estar tomado, así que el más nuevo arriba es el que tiene más chance de
 * existir todavía.
 *
 * **No se ofrece orden por superficie, que era la otra candidata obvia.**
 * `area_m2` puede faltar en una parte de los avisos, y ordenar por un campo
 * ausente ordena mal **y en silencio**: los avisos sin metros se van todos
 * juntos a una punta de la lista sin que nadie pueda ver por qué. Un orden que
 * miente es peor que un orden que no existe.
 *
 * **Vive en `domain/` y no en la pantalla** por la regla permanente del
 * fundador —qué órdenes hay y cuál es el de por defecto es producto, no
 * plantilla— y por la razón mecánica de siempre: el suelo de cobertura del 90 %
 * llega acá y no llega a `app/`.
 */
export type SearchOrder = "recent" | "priceAsc" | "priceDesc";

/**
 * Cómo viaja cada orden en `?orden=`, y **«Recientes» viaja como ausencia**.
 *
 * Ésa es la mitad que resuelve lo de Google, y es la que se podía equivocar sin
 * que nada se pusiera rojo. `orden` entra en `FILTER_KEYS`
 * (`listing-discovery/domain/zone-route.ts`), así que toda dirección que lo
 * lleve sale del índice — la misma lista en otro orden es la MISMA página, y
 * publicarla tres veces es el catálogo entero duplicado. Si la opción por
 * defecto emitiera `?orden=recientes`, la única dirección indexable de la zona
 * pasaría a ser la que ningún enlace de la pantalla apunta: el orden por
 * defecto se caería del índice sin que nadie lo notara.
 *
 * Es el mismo trato que `filtros` y `busca` ya tienen ahí, con la misma razón
 * escrita: devuelven exactamente los mismos avisos que sin ellos.
 */
export const SEARCH_ORDER_TOKENS: Readonly<Record<SearchOrder, string | null>> = {
  recent: null,
  priceAsc: "precio-asc",
  priceDesc: "precio-desc",
};

/**
 * El vocabulario, en el orden en que se ofrece. Lo escribe el dominio porque la
 * lámina 7c dibuja la etiqueta «Recientes ▾» y nada más: ni el desplegable
 * abierto ni las otras dos.
 */
const SEARCH_ORDER_LABELS: Readonly<Record<SearchOrder, string>> = {
  recent: "Recientes",
  priceAsc: "Precio: menor a mayor",
  priceDesc: "Precio: mayor a menor",
};

const SEARCH_ORDERS = Object.keys(SEARCH_ORDER_LABELS) as readonly SearchOrder[];

/** Del token de la dirección al orden, con `recent` como caída. */
const BY_TOKEN: Readonly<Record<string, SearchOrder>> = {
  "precio-asc": "priceAsc",
  "precio-desc": "priceDesc",
};

/**
 * Qué orden pide una dirección.
 *
 * Un token que no existe **cae a «Recientes»**, no rechaza la búsqueda: es la
 * misma regla que `buildSearchCriteria` aplica campo por campo, porque un
 * enlace viejo pegado en un chat pierde ese parámetro y ni uno más.
 *
 * `Object.hasOwn` y no `in`: `in` encuentra `constructor` y `toString` en el
 * prototipo, así que `?orden=constructor` pasaría por un orden válido.
 */
export function readSearchOrder(raw: string | null | undefined): SearchOrder {
  if (raw === null || raw === undefined) return "recent";
  const token = raw.trim();
  return Object.hasOwn(BY_TOKEN, token) ? (BY_TOKEN[token] as SearchOrder) : "recent";
}

export interface SearchOrderOption {
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
}

export interface SearchOrderMenu {
  /**
   * **Cuál de los tres está puesto.** Es la IDENTIDAD del menú, no una
   * etiqueta: con el script encendido la pantalla la usa como `key` para que
   * un orden distinto sea un desplegable distinto — ver `OrderMenu.tsx`.
   */
  readonly order: SearchOrder;
  /** La etiqueta que la pantalla muestra cerrada: el orden puesto. */
  readonly label: string;
  readonly options: readonly SearchOrderOption[];
}

/**
 * Las tres opciones con su dirección ya armada.
 *
 * **Elegir un orden vuelve a la primera página**, y por eso el `page: null` va
 * explícito: `buildSearchHref` sólo reinicia la paginación cuando cambia un
 * *filtro*, y el orden no lo es —no saca ni agrega un solo aviso—. Quedarse en
 * la página 3 al pasar de «Recientes» a «Precio» deja una rebanada del medio
 * que nadie pidió.
 *
 * Lo demás se conserva, incluidos los `utm_*` de un enlace compartido: cambiar
 * el orden no puede soltar la búsqueda que alguien acababa de estrechar.
 */
export function buildOrderMenu(basePath: string, query: SearchQuery): SearchOrderMenu {
  // La tabla de nombres es la del dominio y no se vuelve a escribir acá: una
  // segunda que casualmente coincide es el bug que `indexing-contract.test.ts`
  // existe para atrapar.
  const current = readSearchOrder(query[SEARCH_QUERY_NAMES.order]);

  return {
    order: current,
    label: SEARCH_ORDER_LABELS[current],
    options: SEARCH_ORDERS.map((order) => ({
      label: SEARCH_ORDER_LABELS[order],
      href: buildSearchHref(basePath, query, { order: SEARCH_ORDER_TOKENS[order], page: null }),
      current: order === current,
    })),
  };
}
