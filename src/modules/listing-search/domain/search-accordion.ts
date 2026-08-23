import { isRoomStep, roomStepLabel } from "./room-steps";
import type { ListingAttribute, PublisherType } from "./search-criteria";

/**
 * **Los cuatro pasos del acordeón, y qué dice cada uno cuando está cerrado.**
 *
 * El acordeón secuencial existe porque en 360 px no cabe nada más (documento
 * maestro, §7), no porque sea mejor: en escritorio los mismos cuatro grupos se
 * ven a la vez. Por eso los pasos son una regla del dominio y no una lista de
 * `<details>` en un componente — la pantalla ancha y la angosta dibujan el
 * MISMO conjunto y tienen que coincidir en qué se eligió, qué falta y cómo se
 * resume. Dos listas escritas a mano es cómo empiezan a discrepar.
 *
 * Lo que este archivo NO decide: cuántos resultados hay. Eso lo dice
 * `FacetedSearchPort`, con los números reales de la base (regla transversal 3).
 * Acá sólo vive la forma del paso y su resumen.
 */

/**
 * Los ids son los que viajan en la dirección (`?filtros=zona`), y por eso
 * están en español: son parte del contrato de la URL, igual que `min`, `max` y
 * `hab`.
 */
export type SearchStepId = "ciudad" | "zona" | "precio" | "habitaciones";

/**
 * El orden es la regla: ciudad, zona, precio, habitaciones (F3 → F6).
 *
 * No es estético. La ciudad va primera porque es el contexto que aisla todo lo
 * demás; la zona segunda porque depende de la ciudad y se borra al cambiarla;
 * precio y habitaciones después porque no dependen de ningún lugar y quien
 * llega hasta ahí ya acotó la oferta a algo que se puede mirar.
 */
export const SEARCH_STEPS: readonly SearchStepId[] = ["ciudad", "zona", "precio", "habitaciones"];

/** Lista cerrada como `Record` para que un paso nuevo no compile sin su copia. */
const STEP_COPY: Readonly<Record<SearchStepId, { title: string; question: string }>> = {
  ciudad: { title: "Ciudad", question: "¿En qué ciudad?" },
  zona: { title: "Zona", question: "¿Qué zonas?" },
  precio: { title: "Precio", question: "¿Cuánto podés pagar al mes?" },
  habitaciones: { title: "Habitaciones", question: "¿Cuántas habitaciones?" },
};

/** Lo elegido hasta ahora, en la forma en que se muestra. */
export interface SearchSelection {
  /** Siempre presente: la ciudad la afirma la ruta, nunca la query. */
  readonly cityName: string;
  /** Vacío significa "toda la ciudad", nunca "ninguna". */
  readonly zoneNames: readonly string[];
  readonly minPriceUsd?: number;
  readonly maxPriceUsd?: number;
  readonly minRooms?: number;
  readonly attributes?: readonly ListingAttribute[];
  readonly publisherType?: PublisherType;
}

export interface SearchStepView {
  readonly id: SearchStepId;
  /** 1 a 4, como los rotula la lámina. Sale de la lista, no de una constante. */
  readonly position: number;
  readonly title: string;
  readonly question: string;
  /** Lo que el paso muestra cerrado. Nunca vacío: siempre dice algo. */
  readonly summary: string;
  readonly answered: boolean;
  readonly open: boolean;
}

/**
 * El paso que la dirección pide abrir, o `undefined`.
 *
 * `Object.hasOwn` y no `includes` sobre un objeto ni `in`: la comparación es
 * contra una lista cerrada, y `?filtros=constructor` no puede pasar por un
 * paso válido.
 */
export function readSearchStep(raw: string | null | undefined): SearchStepId | undefined {
  if (raw === null || raw === undefined) return undefined;
  const value = raw.trim() as SearchStepId;
  return SEARCH_STEPS.includes(value) ? value : undefined;
}

/** El que sigue, o `null` en el último. Lo usa el «elegí y seguí» del acordeón. */
export function nextSearchStep(step: SearchStepId): SearchStepId | null {
  const index = SEARCH_STEPS.indexOf(step);
  return SEARCH_STEPS[index + 1] ?? null;
}

/**
 * Los cuatro pasos con su estado, y **exactamente uno abierto o ninguno**.
 *
 * Sin JavaScript el navegador no puede recordar qué sección estaba abierta al
 * volver del servidor, así que el paso abierto viaja en la dirección
 * (`?filtros=…`) y se decide acá. Cuando la dirección no dice nada se abre el
 * primero sin contestar, que es lo que hace que el acordeón avance solo:
 * elegís la zona y la próxima recarga abre el precio.
 *
 * Que sea uno solo no es cosmético — es la razón de ser del acordeón. Con los
 * cuatro abiertos a la vez en 360 px el botón del conteo queda cuatro
 * pantallas más abajo, y ése es justamente el botón que hay que ver mientras
 * se filtra.
 */
export function resolveSearchSteps(
  selection: SearchSelection,
  openStep?: SearchStepId,
): readonly SearchStepView[] {
  const answers: Readonly<Record<SearchStepId, { summary: string; answered: boolean }>> = {
    ciudad: { summary: selection.cityName, answered: true },
    zona: {
      summary: selection.zoneNames.length === 0 ? "Todas" : selection.zoneNames.join(", "),
      answered: selection.zoneNames.length > 0,
    },
    precio: {
      summary: priceSummary(selection),
      answered: selection.minPriceUsd !== undefined || selection.maxPriceUsd !== undefined,
    },
    habitaciones: {
      summary: roomsSummary(selection.minRooms),
      answered: selection.minRooms !== undefined,
    },
  };

  const pending = SEARCH_STEPS.find((id) => !answers[id].answered);
  const open = openStep ?? pending;

  return SEARCH_STEPS.map((id, index) => ({
    id,
    position: index + 1,
    title: STEP_COPY[id].title,
    question: STEP_COPY[id].question,
    summary: answers[id].summary,
    answered: answers[id].answered,
    open: id === open,
  }));
}

/**
 * El rango, o de qué lado quedó abierto. **Los dos extremos son opcionales**
 * (F5), así que hay cuatro estados y ninguno puede quedar sin texto: un paso
 * cerrado y mudo parece roto.
 */
function priceSummary(selection: SearchSelection): string {
  const { minPriceUsd: min, maxPriceUsd: max } = selection;
  if (min !== undefined && max !== undefined) return `$${min} – $${max}`;
  if (min !== undefined) return `Desde $${min}`;
  if (max !== undefined) return `Hasta $${max}`;
  return "Cualquiera";
}

/**
 * El escalón elegido, con su «+» cuando corresponde.
 *
 * El «+» sale de `roomStepLabel` y no de un ternario acá: el criterio es un
 * MÍNIMO, y que el último escalón diga "o más" es la regla que ya vive en
 * `room-steps.ts`. Un `minRooms` que no es un escalón ofrecido —una dirección
 * escrita a mano con `hab=7`— se dice tal cual, porque el criterio lo admite
 * aunque el control no tenga un botón para pedirlo.
 */
function roomsSummary(minRooms: number | undefined): string {
  if (minRooms === undefined) return "Cualquiera";
  return isRoomStep(minRooms) ? `${roomStepLabel(minRooms)} hab` : `${minRooms}+ hab`;
}

/**
 * Con qué se encabeza la pantalla de resultados: las zonas elegidas, o la
 * ciudad cuando no hay ninguna.
 *
 * Nunca queda vacío, y ése es el punto: la barra de la lámina dice «Chacao,
 * Altamira» y, sin zonas, tiene que seguir diciendo dónde se está buscando.
 */
export function searchHeadline(selection: SearchSelection): string {
  return selection.zoneNames.length === 0 ? selection.cityName : selection.zoneNames.join(", ");
}

/** Cómo se lee un publicador en el resumen. Copia, no regla. */
const PUBLISHER_SUMMARY: Readonly<Record<PublisherType, string>> = {
  owner: "dueños",
  broker: "inmobiliarias",
};

const ATTRIBUTE_SUMMARY: Readonly<Record<ListingAttribute, string>> = {
  hasPowerPlant: "planta",
  hasRegularWater: "agua",
  isFurnished: "amoblado",
  hasSecurity: "vigilancia",
  hasAppliances: "línea blanca",
};

/**
 * La línea de la barra resumen: **el conteo primero**, y después qué filtros lo
 * produjeron — «9 avisos · $250 – $700 · 2 hab · dueños».
 *
 * El número va adelante porque es lo que se está mirando; los filtros van
 * detrás porque son la explicación de ese número. Sin filtros la línea es sólo
 * el conteo, y sigue siendo una frase completa.
 */
export function summariseSearch(selection: SearchSelection, total: number): string {
  const parts: string[] = [total === 1 ? "1 aviso" : `${total} avisos`];

  if (selection.minPriceUsd !== undefined || selection.maxPriceUsd !== undefined) {
    parts.push(priceSummary(selection));
  }
  if (selection.minRooms !== undefined) parts.push(roomsSummary(selection.minRooms));
  if (selection.publisherType !== undefined) {
    parts.push(PUBLISHER_SUMMARY[selection.publisherType]);
  }
  for (const attribute of selection.attributes ?? []) parts.push(ATTRIBUTE_SUMMARY[attribute]);

  return parts.join(" · ");
}

/**
 * Cuántos filtros hay puestos — el número que el engranaje lleva al lado.
 *
 * **La ciudad no cuenta, y es la misma razón por la que «Limpiar todo» no la
 * toca** (F8): es el contexto de la búsqueda, no un filtro. Las zonas cuentan
 * como uno solo por muchas que sean, porque se combinan con O y son una sola
 * decisión ensanchada; los atributos cuentan de a uno, porque se combinan con
 * Y y cada uno estrecha por su cuenta.
 */
export function countActiveFilters(selection: SearchSelection): number {
  let count = selection.attributes?.length ?? 0;
  if (selection.zoneNames.length > 0) count += 1;
  if (selection.minPriceUsd !== undefined || selection.maxPriceUsd !== undefined) count += 1;
  if (selection.minRooms !== undefined) count += 1;
  if (selection.publisherType !== undefined) count += 1;
  return count;
}
