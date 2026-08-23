import type { ListingAttribute } from "./search-criteria";

/**
 * **El botón dice cuántos resultados va a devolver, nunca «Aplicar»** (F7).
 *
 * Es lo más importante de esta pantalla, y la razón es medible: un botón que
 * dice «Aplicar» obliga a aplicar para saber si valió la pena, y con 47 avisos
 * en una ciudad ese viaje de ida y vuelta es la diferencia entre filtrar y
 * abandonar. Con el número adentro —«Ver 47 avisos» → «Ver 21» → «Ver 16» →
 * «Ver 9»— cada paso se decide antes de darlo.
 *
 * El número sale de `FacetedSearchPort.total`, que lo cuenta sobre las filas
 * reales: la regla transversal 3 del fundador dice «todo conteo es real, si una
 * etiqueta dice 9, hay 9», y un botón que promete 9 sobre una lista de 7 rompe
 * lo único para lo que existe.
 *
 * **Sin JavaScript el número sigue siendo real**, y eso es lo que este archivo
 * hace posible: cada opción del acordeón es un enlace `GET`, así que el
 * servidor vuelve a contar con los filtros de la dirección y vuelve a escribir
 * esta etiqueta. No hay estado en el cliente que pueda quedar desfasado porque
 * no hay estado en el cliente.
 */

/** Los filtros que se pueden soltar cuando la búsqueda se queda sin nada. */
export type RelaxableFilter = "zone" | "price" | "rooms" | "publisherType" | ListingAttribute;

/**
 * De más cercano a la intención a más periférico.
 *
 * Decide los empates: con dos filtros que devuelven lo mismo se suelta el de
 * más abajo. La zona es lo primero de la lista porque es lo que la persona vino
 * a buscar — proponerle "salí de Chacao" cuando alcanza con soltar un atributo
 * es cambiarle la búsqueda en vez de destrabarla.
 */
const RELAXATION_ORDER: readonly RelaxableFilter[] = [
  "zone",
  "rooms",
  "price",
  "publisherType",
  "hasPowerPlant",
  "hasRegularWater",
  "isFurnished",
  "hasSecurity",
  "hasAppliances",
];

/** Cómo se nombra cada filtro dentro de la oferta. Copia, no regla. */
const RELAXATION_NAMES: Readonly<Record<RelaxableFilter, string>> = {
  zone: "las zonas",
  price: "el precio",
  rooms: "las habitaciones",
  publisherType: "quién publica",
  hasPowerPlant: "planta eléctrica",
  hasRegularWater: "agua regular",
  isFurnished: "amoblado",
  hasSecurity: "vigilancia 24 h",
  hasAppliances: "línea blanca",
};

/** Cuántos resultados habría si se soltara ese filtro y ningún otro. */
export interface ReliefCandidate {
  readonly filter: RelaxableFilter;
  readonly resultCount: number;
  /**
   * La dirección sin ese filtro. **Obligatoria**: una salida ofrecida que no
   * lleva a ninguna parte es una frase amable, no una salida, y la regla
   * transversal 5 pide una acción de verdad.
   */
  readonly href: string;
}

/**
 * Lo mínimo que una salida ofrecida trae: qué dice, cuántos hay del otro lado
 * y adónde lleva.
 *
 * Es un tipo aparte del de abajo para que el botón del acordeón pueda mostrar
 * **cualquiera** de las salidas de F11 —soltar un filtro, ampliar el precio,
 * sumar una zona— sin que este archivo tenga que conocerlas: ampliar el precio
 * no suelta ningún filtro, así que no tiene un `filter` que declarar.
 */
export interface ReliefOffer {
  /** «Quitar el precio y ver 14» — el número va adentro, igual que en el botón. */
  readonly label: string;
  readonly resultCount: number;
  readonly href: string;
}

export interface SearchRelief extends ReliefOffer {
  readonly filter: RelaxableFilter;
}

/**
 * **Un solo cambio propuesto, con su número** (F7 y F10).
 *
 * Uno y no tres: una pantalla vacía que ofrece cuatro salidas es la misma
 * pantalla vacía con más trabajo encima. Se elige el filtro que más resultados
 * destraba; empatados, el más periférico, porque cambiarle a alguien el lugar
 * que eligió es lo último que hay que tocar.
 *
 * `null` cuando ningún cambio devuelve nada: ofrecer "quitá el precio y ver 0"
 * sería mandar a otro vacío, que es exactamente lo que la regla transversal 4
 * prohíbe.
 */
export function chooseRelief(candidates: readonly ReliefCandidate[]): SearchRelief | null {
  let best: ReliefCandidate | null = null;
  for (const candidate of candidates) {
    if (candidate.resultCount <= 0) continue;
    if (best === null || candidate.resultCount > best.resultCount) {
      best = candidate;
      continue;
    }
    // Empate: gana el más periférico, o sea el de más abajo en el orden.
    if (
      candidate.resultCount === best.resultCount &&
      RELAXATION_ORDER.indexOf(candidate.filter) > RELAXATION_ORDER.indexOf(best.filter)
    ) {
      best = candidate;
    }
  }

  if (best === null) return null;

  return {
    filter: best.filter,
    label: `Quitar ${RELAXATION_NAMES[best.filter]} y ver ${best.resultCount}`,
    resultCount: best.resultCount,
    href: best.href,
  };
}

/**
 * Qué hace el botón de confirmar, y qué dice.
 *
 * Tres formas, porque son tres situaciones distintas y una sola etiqueta las
 * confundiría:
 *
 * - `results` — el caso normal. Lleva a la lista y dice cuántos hay.
 * - `listing` — **con un solo resultado va directo a la ficha** (F7). Pasar
 *   por una lista de un elemento es una pantalla intermedia que no informa
 *   nada: ya se sabe que hay uno, porque el botón lo dijo.
 * - `empty` — cero resultados. **No se deshabilita**: un botón apagado no
 *   explica nada y deja la pantalla sin salida, contra la regla transversal 5.
 *   Dice qué pasó y ofrece un cambio con su número.
 */
export type SearchConfirm =
  | { readonly kind: "results"; readonly label: string; readonly href: string }
  | { readonly kind: "listing"; readonly label: string; readonly href: string }
  | { readonly kind: "empty"; readonly label: string; readonly relief: ReliefOffer | null };

export interface SearchConfirmInput {
  readonly total: number;
  readonly resultsHref: string;
  /**
   * La ficha del único resultado, cuando hay exactamente uno.
   *
   * Opcional porque quien llama no siempre la tiene a mano — el acordeón se
   * dibuja antes de traer las filas. Sin ella se cae a la lista en vez de
   * romperse: una pantalla de más es peor que una pantalla rota sólo hasta que
   * la rota existe.
   */
  readonly onlyListingHref?: string;
  readonly relief?: ReliefOffer | null;
}

export function resolveSearchConfirm(input: SearchConfirmInput): SearchConfirm {
  const { total, resultsHref, onlyListingHref } = input;

  if (total <= 0) {
    return { kind: "empty", label: "Ningún aviso coincide", relief: input.relief ?? null };
  }

  if (total === 1 && onlyListingHref !== undefined) {
    return { kind: "listing", label: "Ver el único aviso", href: onlyListingHref };
  }

  return {
    kind: "results",
    label: total === 1 ? "Ver 1 aviso" : `Ver ${total} avisos`,
    href: resultsHref,
  };
}
