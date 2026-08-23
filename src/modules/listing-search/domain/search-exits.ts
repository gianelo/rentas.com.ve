import type { Pagination } from "./pagination";
import { describeFilter, type SearchSelection, toSearchSelection } from "./search-accordion";
import {
  chooseRelief,
  type RelaxableFilter,
  type ReliefCandidate,
  type SearchRelief,
} from "./search-confirm";
import type { SearchCriteria } from "./search-criteria";
import { type PanelZone, relaxableFilters, reliefHref, zoneHref } from "./search-panel";
import { buildSearchHref, clearAllHref, type SearchQuery } from "./search-query";

/**
 * **Ninguna pantalla termina en un vacío sin salida** (regla transversal 5), y
 * las dos puntas de la lista son donde eso se decide: el cero y el final.
 *
 * Las dos preguntas son la misma pregunta —«¿qué cambio de UN filtro devuelve
 * más avisos, y cuántos exactamente?»— así que las responde un solo archivo:
 *
 * - **F11, el cero.** No un «no hay resultados» genérico: se nombra el filtro
 *   que está causando el vacío y se ofrecen hasta tres salidas concretas, cada
 *   una con su número — soltar el filtro más restrictivo, ampliar el precio al
 *   siguiente escalón, sumar la zona vecina con más oferta.
 * - **F10, el final.** «Son los 9 avisos que coinciden», más el cambio que más
 *   suma: «Ampliar a $900 y ver 14». Uno solo, y con el número que va a dar.
 *
 * **La ciudad no se afloja nunca.** No es un filtro sino el alcance de la
 * búsqueda (D5), así que ninguna salida de acá sale de la ciudad: mostrar
 * avisos de Maracaibo como consuelo de una búsqueda en Caracas es cambiarle la
 * búsqueda a alguien, no destrabársela. Se ve en las direcciones: todas salen
 * de `basePath` o `cityPath`, y no existe una rama que arme la de otra ciudad.
 *
 * **Cada número es real y sale de los conteos, no de una estimación** (regla
 * transversal 3). Y todos vienen de la MISMA consulta que ya cuenta las
 * facetas: `FacetCounts.withoutFilter` trae cuántos quedarían al soltar cada
 * filtro, `byZone` cuántos suma cada zona vecina y `withWidenedPrice` cuántos
 * el escalón siguiente. Calcular las salidas cuesta **cero viajes de red
 * extra**, que es lo que permite ofrecerlas también cuando SÍ hay resultados.
 */

/**
 * Los escalones del precio, en dólares.
 *
 * **Crecen con el precio a propósito.** Cincuenta dólares sobre 200 es una
 * decisión que alguien toma; sobre 2000 no es nada, y ofrecer «Ampliar a
 * $2050» es gastar la única salida que la regla permite en un cambio que no
 * mueve la lista. De $50 hasta 300, de $100 hasta 700, y de ahí en saltos que
 * acompañan lo que el mercado realmente cobra.
 */
export const PRICE_STEPS = [
  100, 150, 200, 250, 300, 400, 500, 600, 700, 900, 1100, 1300, 1500, 2000, 2500, 3000,
] as const;

export interface PriceRange {
  readonly minPriceUsd?: number;
  readonly maxPriceUsd?: number;
}

/**
 * El precio ampliado un escalón, o `null` cuando no hay adónde ampliarlo.
 *
 * **Se mueve un solo extremo, y el otro se conserva.** Un rango de $250 a $700
 * que se amplía a "$0 a $900" son dos cambios disfrazados de uno, y la regla
 * pide UN cambio por vez.
 *
 * El techo es el que se mueve cuando hay techo, porque es el que aprieta: quien
 * puso «hasta $700» está diciendo cuánto puede pagar. Con sólo un piso puesto,
 * ampliar es bajarlo — la misma operación del otro lado.
 *
 * Arriba del último escalón devuelve `null` en vez de inventar uno: ahí la
 * salida honesta es soltar el precio entero, y ésa ya la ofrece `chooseRelief`.
 */
export function widenPrice(
  criteria: Pick<SearchCriteria, "minPriceUsd" | "maxPriceUsd">,
): PriceRange | null {
  const { minPriceUsd: min, maxPriceUsd: max } = criteria;

  if (max !== undefined) {
    const next = PRICE_STEPS.find((step) => step > max);
    if (next === undefined) return null;
    return { ...(min === undefined ? {} : { minPriceUsd: min }), maxPriceUsd: next };
  }

  if (min !== undefined) {
    const lower = [...PRICE_STEPS].reverse().find((step) => step < min);
    if (lower === undefined) return null;
    return { minPriceUsd: lower };
  }

  return null;
}

/** De dónde sale cada salida. La pantalla no lo usa para decidir, sólo para rotular. */
export type SearchExitKind = "drop" | "widen-price" | "add-zone" | "clear-all";

export interface SearchExit {
  readonly kind: SearchExitKind;
  /** «Ampliar a $900 y ver 14»: el número va adentro, igual que en el botón de F7. */
  readonly label: string;
  readonly href: string;
  /** Cuántos avisos hay del otro lado. Real, contado, nunca estimado. */
  readonly resultCount: number;
}

/**
 * Qué le pasa a la lista, y por lo tanto qué hay que dibujar al final.
 *
 * `partial` no es un caso vacío: es la mitad de una lista paginada, donde
 * cerrar sería mentir —todavía faltan avisos— y no hay nada que decir.
 */
export type SearchOutcome =
  | { readonly kind: "empty"; readonly cause: string; readonly exits: readonly SearchExit[] }
  | { readonly kind: "complete"; readonly closing: string; readonly exit: SearchExit | null }
  | { readonly kind: "partial" };

/** Los conteos que las salidas necesitan. Es la forma de `FacetCounts`, sin importarlo. */
export interface OutcomeCounts {
  readonly total: number;
  /** La ciudad entera sin un solo filtro del panel. Es el número de «Limpiar todo». */
  readonly cityTotal: number;
  readonly byZone: Readonly<Record<string, number>>;
  readonly withoutFilter: Readonly<Record<RelaxableFilter, number>>;
  /** El total con el precio ampliado un escalón, si se preguntó. */
  readonly withWidenedPrice?: number;
}

export interface SearchOutcomeInput {
  readonly basePath: string;
  readonly cityPath: string;
  readonly query: SearchQuery;
  readonly cityName: string;
  readonly criteria: SearchCriteria;
  readonly chosenZoneIds: readonly string[];
  /** Las zonas de ESTA ciudad, en el orden del catálogo. */
  readonly zones: readonly PanelZone[];
  readonly counts: OutcomeCounts;
  readonly pagination: Pagination;
}

export function resolveSearchOutcome(input: SearchOutcomeInput): SearchOutcome {
  const { counts, pagination } = input;
  const selection = toSearchSelection(input.cityName, zoneNames(input), input.criteria);
  const exits = buildExits(input);

  if (counts.total <= 0) {
    return {
      kind: "empty",
      cause: explainVoid(input, selection),
      exits: orLastResort(input, exits),
    };
  }

  // A mitad de la lista no se cierra nada, y una página que ya no existe tiene
  // su propia salida —«ver la última»— que no es una relajación de filtros.
  if (pagination.next !== null || pagination.beyondEnd) return { kind: "partial" };

  return {
    kind: "complete",
    closing:
      counts.total === 1
        ? "Es el único aviso que coincide"
        : `Son los ${counts.total} avisos que coinciden`,
    exit: bestExit(exits),
  };
}

/**
 * Las tres salidas, en el orden en que se leen: soltar, ampliar, sumar zona.
 *
 * **Ninguna que devuelva lo mismo que ya hay.** Un filtro que no está
 * apretando devolvería el mismo número, y «Quitar el precio y ver 9» sobre una
 * lista de 9 es un botón que no hace nada — la regla 4 otra vez, del lado del
 * que sí tiene resultados.
 */
function buildExits(input: SearchOutcomeInput): readonly SearchExit[] {
  const exits = [dropExit(input), widenExit(input), addZoneExit(input)];
  return exits.filter(
    (exit): exit is SearchExit => exit !== null && exit.resultCount > input.counts.total,
  );
}

/**
 * El filtro que más destraba, con su número. La elección y el empate ya los
 * decide `chooseRelief`, que es la misma regla que ya usaba el acordeón.
 *
 * Se descartan antes las candidatas que devuelven lo que ya hay: un filtro que
 * no aprieta no es el que está causando el vacío ni una salida que sume.
 */
function bestDrop(input: SearchOutcomeInput): SearchRelief | null {
  const candidates: readonly ReliefCandidate[] = relaxableFilters(
    input.criteria,
    input.chosenZoneIds,
  ).map((filter) => ({
    filter,
    resultCount: input.counts.withoutFilter[filter],
    href: reliefHref(input, filter),
  }));

  return chooseRelief(candidates.filter((candidate) => candidate.resultCount > input.counts.total));
}

function dropExit(input: SearchOutcomeInput): SearchExit | null {
  const relief = bestDrop(input);
  if (relief === null) return null;

  return {
    kind: "drop",
    label: relief.label,
    href: relief.href,
    resultCount: relief.resultCount,
  };
}

/** El siguiente escalón de precio, con el número que ya trajo la consulta. */
function widenExit(input: SearchOutcomeInput): SearchExit | null {
  const widened = widenPrice(input.criteria);
  const count = input.counts.withWidenedPrice;
  if (widened === null || count === undefined) return null;

  const raised = input.criteria.maxPriceUsd !== undefined;
  const edge = raised ? widened.maxPriceUsd : widened.minPriceUsd;

  return {
    kind: "widen-price",
    label: `${raised ? "Ampliar" : "Bajar"} a $${edge} y ver ${count}`,
    href: buildSearchHref(input.basePath, input.query, {
      minPrice: widened.minPriceUsd === undefined ? null : String(widened.minPriceUsd),
      maxPrice: widened.maxPriceUsd === undefined ? null : String(widened.maxPriceUsd),
    }),
    resultCount: count,
  };
}

/**
 * La zona vecina con más oferta, **sin soltar la que ya se eligió**.
 *
 * Vecina quiere decir "de esta ciudad": el catálogo guarda la jerarquía pero no
 * qué zona linda con cuál, así que inventar una adyacencia sería una regla sin
 * dato detrás. La ciudad es el vecindario, y es exactamente el límite que D5
 * pide no cruzar.
 *
 * Las zonas se combinan con O y una fila tiene una sola zona, así que sumar la
 * vecina suma su conteo al total sin superponerse: por eso el número es exacto
 * y no una estimación.
 */
function addZoneExit(input: SearchOutcomeInput): SearchExit | null {
  if (input.chosenZoneIds.length === 0) return null;

  let best: { readonly zone: PanelZone; readonly count: number } | null = null;
  for (const zone of input.zones) {
    if (input.chosenZoneIds.includes(zone.id)) continue;
    const count = input.counts.byZone[zone.id] ?? 0;
    if (count <= 0) continue;
    if (best === null || count > best.count) best = { zone, count };
  }
  if (best === null) return null;

  const resultCount = input.counts.total + best.count;

  return {
    kind: "add-zone",
    label: `Agregar ${best.zone.name} y ver ${resultCount}`,
    href: zoneHref(input, best.zone.id),
    resultCount,
  };
}

/**
 * Cuando ningún cambio de un solo filtro devuelve nada, la salida es limpiar.
 *
 * Es el último recurso y **sólo aparece en el vacío**: con resultados en
 * pantalla, «Limpiar todo» ya está en el panel y no es una relajación. Lleva su
 * número igual que las demás, y si la ciudad entera está vacía no se ofrece —
 * mandar a alguien a otro cero es lo único peor que no ofrecer nada.
 */
function orLastResort(
  input: SearchOutcomeInput,
  exits: readonly SearchExit[],
): readonly SearchExit[] {
  if (exits.length > 0) return exits;
  if (input.counts.cityTotal <= 0) return [];

  return [
    {
      kind: "clear-all",
      label: `Limpiar todo y ver ${input.counts.cityTotal}`,
      href: clearAllHref(input.cityPath, input.query),
      resultCount: input.counts.cityTotal,
    },
  ];
}

/** El cambio que más suma. Empatados gana el primero, que es el más directo. */
export function bestExit(exits: readonly SearchExit[]): SearchExit | null {
  let best: SearchExit | null = null;
  for (const exit of exits) {
    if (best === null || exit.resultCount > best.resultCount) best = exit;
  }
  return best;
}

/**
 * **Qué filtro está causando el vacío**, dicho con las mismas palabras con las
 * que la barra resumen ya nombra ese filtro.
 *
 * El culpable es el filtro que, soltado solo, devuelve más avisos: es la
 * definición operativa de "está causando el vacío", y es la única que se puede
 * verificar contra la base en vez de suponer. Cuando ninguno solo alcanza, la
 * frase lo dice — culpar a uno cualquiera sería mandar a soltarlo para volver
 * al mismo cero.
 */
function explainVoid(input: SearchOutcomeInput, selection: SearchSelection): string {
  const filters = relaxableFilters(input.criteria, input.chosenZoneIds);

  if (filters.length === 0) {
    return input.counts.cityTotal <= 0
      ? `Todavía no hay avisos publicados en ${input.cityName}.`
      : `Ningún aviso de ${input.cityName} coincide con esta búsqueda.`;
  }

  const guilty = bestDrop(input);
  if (guilty !== null) {
    return `Ningún aviso coincide: «${describeFilter(selection, guilty.filter)}» es el filtro que deja la búsqueda en cero.`;
  }

  const named = filters.map((filter) => `«${describeFilter(selection, filter)}»`);
  return `Ningún aviso coincide: no es un filtro solo, es la combinación de ${join(named)}.`;
}

/** «a», «b» y «c». Copia, no regla. */
function join(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

function zoneNames(input: SearchOutcomeInput): readonly string[] {
  return input.chosenZoneIds
    .map((id) => input.zones.find((zone) => zone.id === id)?.name)
    .filter((name): name is string => name !== undefined);
}
