import type { RoomStep } from "./room-steps";
import { confirmCountLabel, type RelaxableFilter } from "./search-confirm";
import type { ListingAttribute, PublisherType } from "./search-criteria";

/**
 * **Cuántos avisos va a devolver la opción que se acaba de tocar, sin
 * preguntarle a nadie** (14.34 — «baja de 70 a 9 mientras se filtra»).
 *
 * ## Por qué el número YA está en la página
 *
 * La 14.11 dejó una sola consulta que devuelve las filas **y todas las
 * facetas**, y el criterio con el que las cuenta es lo que hace posible este
 * archivo: `drizzle-faceted-search.ts` cuenta cada faceta **ignorando su propio
 * filtro y respetando todos los demás**. Ese número no es «cuántos hay con esta
 * característica»: es literalmente **cuántos quedarían si cambiaras a esta
 * opción**. Y la misma consulta trae las nueve relajaciones
 * (`FacetCounts.withoutFilter`), que son el mismo número al revés — cuántos
 * quedarían si soltaras ese filtro.
 *
 * O sea que para **cada uno de los diez enlaces del panel**, en los dos
 * sentidos, el total resultante ya viajó en la respuesta que la pantalla está
 * dibujando. Adelantarlo no cuesta un viaje más a Neon, que es la razón por la
 * que 14.11 existe: *"el costo son los viajes de red, no Postgres"*.
 *
 * ## Por qué es exacto y no una estimación
 *
 * La regla transversal 3 del fundador es dura: *«todo conteo es real, si una
 * etiqueta dice 9, hay 9»*, y `search-confirm.ts` la repite — un botón que
 * promete 9 sobre una lista de 7 rompe lo único para lo que existe. Acá no se
 * suma, no se resta y no se cruza nada: se lee **el número que Postgres ya
 * contó** para esa opción exacta. Cuando el número no está —el precio es un
 * rango, y un rango no tiene faceta— la respuesta es `null` y el botón se queda
 * con lo que el servidor escribió, en vez de inventar uno. Falla cerrado
 * (AGENTS.md §7).
 *
 * ## Por qué vive acá y no en el componente de cliente
 *
 * La regla permanente del fundador. Qué número corresponde a qué opción es una
 * decisión de producto, y escrita en un `"use client"` quedaría fuera del suelo
 * de cobertura del 90 % — o sea, una regla que ninguna corrida de tests puede
 * poner en rojo. El componente recibe la **etiqueta ya escrita** y sólo la
 * pone en pantalla.
 */

/** Los conteos que ya viajaron con la página, y que alcanzan para adelantarse. */
export interface PreviewCounts {
  readonly byMinRooms: Readonly<Record<RoomStep, number>>;
  readonly byAttribute: Readonly<Record<ListingAttribute, number>>;
  readonly byPublisherType: Readonly<Record<PublisherType, number>>;
  /** Cuántos quedarían soltando ese filtro y ningún otro (F10 y F11). */
  readonly withoutFilter: Readonly<Record<RelaxableFilter, number>>;
  /** La ciudad sin un solo filtro del panel: el número de «Limpiar todo». */
  readonly cityTotal: number;
}

/**
 * El cambio que un enlace del panel produce.
 *
 * **Los dos sentidos, y eso no es simetría gratuita**: volver a tocar la opción
 * elegida la suelta (`RoomOption.nextValue === null`), así que la mitad de los
 * toques posibles son quitar un filtro y no ponerlo. Sin ese caso el botón se
 * congelaría justo cuando alguien se arrepiente, que es cuando más necesita
 * saber a cuánto vuelve.
 *
 * **El precio no está**, y su ausencia es la decisión: es un rango escrito a
 * mano en dos campos, no una opción de una lista, así que no tiene faceta que
 * lo cuente. Adivinarlo sería el único número mentiroso de la pantalla.
 */
export type PreviewChange =
  | { readonly kind: "rooms"; readonly step: RoomStep | null }
  | { readonly kind: "publisher"; readonly value: PublisherType | null }
  | { readonly kind: "attribute"; readonly attribute: ListingAttribute; readonly add: boolean }
  | { readonly kind: "clearAll" };

/**
 * `?.` y no un acceso directo, aunque el tipo prometa el objeto: quien llama es
 * una pantalla, y una pantalla vieja o un doble de prueba puede llegar sin las
 * relajaciones. Sin esto el botón no se quedaría con el número viejo — la
 * página entera reventaría.
 */
function totalAfter(counts: PreviewCounts, change: PreviewChange): number | undefined {
  if (change.kind === "clearAll") return counts.cityTotal;
  if (change.kind === "rooms") {
    return change.step === null ? counts.withoutFilter?.rooms : counts.byMinRooms?.[change.step];
  }
  if (change.kind === "publisher") {
    return change.value === null
      ? counts.withoutFilter?.publisherType
      : counts.byPublisherType?.[change.value];
  }
  return change.add
    ? counts.byAttribute?.[change.attribute]
    : counts.withoutFilter?.[change.attribute];
}

/**
 * La etiqueta que el botón va a decir en cuanto se toque esa opción, o `null`
 * si el número no viajó con la página.
 *
 * `confirmCountLabel` y no un formateo propio: los dos textos aparecen en el
 * mismo botón con medio segundo de diferencia, y dos formateos separados son
 * dos que se separan.
 */
export function previewConfirmLabel(counts: PreviewCounts, change: PreviewChange): string | null {
  const total = totalAfter(counts, change);
  if (total === undefined || !Number.isFinite(total)) return null;
  return confirmCountLabel(total);
}
