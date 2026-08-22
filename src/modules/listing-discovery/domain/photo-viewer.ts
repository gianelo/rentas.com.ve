import { resolveListingRoute } from "./listing-detail-route";
import { buildListingPath, type ListingUrlParts } from "./listing-url";

/**
 * Las reglas del visor de fotos (F27, tareas 16.5 / 16.7 / 16.8).
 *
 * **Todas viven acá y ninguna en `app/`.** La página del visor lee parámetros,
 * consulta y dibuja; qué foto pide una URL, cuál es la anterior y a dónde
 * lleva la salida son decisiones de negocio, y una decisión de negocio escrita
 * en un componente es una decisión que nadie vuelve a encontrar.
 *
 * **El visor es navegación, no un estado de la ficha.** Cada foto tiene su
 * propia dirección, así que se puede indexar, se puede mandar por WhatsApp una
 * foto concreta, y anterior/siguiente son enlaces reales. La consecuencia que
 * conviene dejar escrita porque no se programa en ninguna parte: **el botón
 * "atrás" del navegador retrocede UNA FOTO, no sale del aviso.** Eso lo da el
 * historial de navegación por usar enlaces; con un visor de JavaScript sobre la
 * misma página habría que reimplementarlo, y saldría peor.
 */

/** El segmento que separa el aviso de la foto: `…/foto/2`. */
export const PHOTO_SEGMENT = "foto";

/**
 * **Sólo dígitos, y anclado.** El valor termina indexando el arreglo de fotos
 * del aviso, así que lo que apenas parece un número se rechaza acá. `Number`
 * a secas aceptaría `" 2"`, `"2e1"`, `"0x2"` y `""` — cada uno produciría un
 * índice plausible sobre una URL que nadie escribió.
 */
const PHOTO_NUMBER = /^[0-9]+$/;

export interface PhotoViewerInput {
  /** El aviso, con lo que hace falta para rearmar su ruta canónica. */
  readonly listing: ListingUrlParts;
  /** El `<n>` crudo de la URL, todavía sin interpretar. */
  readonly segment: string;
  /** La ruta que se pidió, tal cual llegó. */
  readonly requestedPath: string;
  /** Cuántas fotos dibujables tiene el aviso. */
  readonly total: number;
}

/** Una foto de la tira del visor, ya resuelta a enlace. */
export interface PhotoViewerItem {
  /** Base uno, el de la URL. */
  readonly number: number;
  /** Base cero, el de `listing_photo.position`. */
  readonly position: number;
  readonly href: string;
  readonly current: boolean;
}

export interface PhotoViewerView {
  /** Base cero: con esto se busca la fila en la lista de fotos. */
  readonly position: number;
  /** Base uno: con esto se escribe la URL y el contador "2 / 6". */
  readonly number: number;
  readonly total: number;
  /** `null` en la primera foto — el visor se detiene, no da la vuelta. */
  readonly previousHref: string | null;
  /** `null` en la última, por la misma razón. */
  readonly nextHref: string | null;
  /** La salida: la ficha del aviso. */
  readonly exitHref: string;
  readonly photos: readonly PhotoViewerItem[];
}

export type PhotoViewerResolution =
  | { readonly kind: "notFound" }
  | { readonly kind: "redirect"; readonly to: string }
  | { readonly kind: "view"; readonly view: PhotoViewerView };

/**
 * **La traducción entre las dos numeraciones, en un solo lugar (16.8).**
 *
 * F27 escribe `/foto/2` para la segunda foto y `listing_photo.position` guarda
 * `1` para esa misma foto. Las dos son correctas de su lado: nadie dice "foto
 * cero" en voz alta, y ningún arreglo empieza en uno. El error no está en
 * elegir una sino en traducirlas de nuevo en cada pantalla que las cruza —
 * la tira, el visor, el alternativo — hasta que una queda corrida en uno.
 */
export function photoNumberOf(position: number): number {
  return position + 1;
}

export function photoPositionOf(photoNumber: number): number {
  return photoNumber - 1;
}

/** El `<n>` de la URL como número, o `null` si ese segmento no es uno. */
export function parsePhotoNumber(segment: string): number | null {
  return PHOTO_NUMBER.test(segment) ? Number(segment) : null;
}

/** `…/foto/<n>`, colgando de la ruta del aviso. */
export function photoViewerPath(listingPath: string, photoNumber: number): string {
  return `${listingPath}/${PHOTO_SEGMENT}/${photoNumber}`;
}

export interface PhotoNeighbours {
  readonly previous: number | null;
  readonly next: number | null;
}

/**
 * **El visor se detiene en los bordes; NO da la vuelta.** Es una decisión, y
 * su razón es la misma que hace que anterior y siguiente sean enlaces reales.
 *
 * Con enlaces, el historial del navegador ES la secuencia de fotos. Un ciclo
 * la convierte en una rueda sin final: quien recorrió las seis no tiene cómo
 * saber que ya las vio todas, y un rastreador que siga "siguiente" nunca llega
 * al borde del conjunto — sigue encontrando una página más, siempre. Que la
 * última no tenga siguiente es lo que hace que "última foto" signifique algo.
 *
 * El costo, dicho en vez de escondido: en un visor táctil dar la vuelta es
 * cómodo. Se paga a cambio de que la secuencia tenga principio y fin.
 */
export function photoNeighbours(photoNumber: number, total: number): PhotoNeighbours {
  return {
    previous: photoNumber > 1 ? photoNumber - 1 : null,
    next: photoNumber < total ? photoNumber + 1 : null,
  };
}

/**
 * Qué hace el visor con una petición: no existe, se redirige, o se dibuja.
 *
 * **El orden de las tres preguntas es parte de la regla.** El rango se decide
 * ANTES que la ruta canónica: redirigir `/foto/99` a su forma canónica para
 * responder 404 ahí son dos viajes para la misma respuesta, porque una foto
 * que no existe no existe con ninguna ortografía.
 */
export function resolvePhotoViewer({
  listing,
  segment,
  requestedPath,
  total,
}: PhotoViewerInput): PhotoViewerResolution {
  const photoNumber = parsePhotoNumber(segment);

  // Un aviso sin fotos no tiene visor: ninguna `n` cae dentro de cero, y esta
  // comparación ya lo cubre sin una rama propia.
  if (photoNumber === null || photoNumber < 1 || photoNumber > total) {
    return { kind: "notFound" };
  }

  const route = resolveViewerRoute(listing, photoNumber, requestedPath);
  if (route.kind === "redirect") return route;

  const listingPath = buildListingPath(listing);
  const { previous, next } = photoNeighbours(photoNumber, total);

  return {
    kind: "view",
    view: {
      position: photoPositionOf(photoNumber),
      number: photoNumber,
      total,
      previousHref: previous === null ? null : photoViewerPath(listingPath, previous),
      nextHref: next === null ? null : photoViewerPath(listingPath, next),
      exitHref: listingPath,
      photos: Array.from({ length: total }, (_unused, index) => {
        const number = photoNumberOf(index);
        return {
          number,
          position: index,
          href: photoViewerPath(listingPath, number),
          current: number === photoNumber,
        };
      }),
    },
  };
}

/**
 * **La deuda de la 11.1, que acá se multiplica por la cantidad de fotos.**
 *
 * Toda ruta que termine en el mismo id resuelve al mismo aviso, así que
 * servirlas todas publicaría URLs duplicadas sin límite. En el visor cada
 * variante del aviso se cruza además con cada foto: seis fotos y tres formas
 * de escribir la zona son dieciocho URLs para seis fotografías.
 *
 * **La parte del aviso la decide `resolveListingRoute` y no esta función.**
 * El visor cuelga de la ficha, así que su forma canónica es la canónica de la
 * ficha más el segmento de la foto. Repetir el criterio acá serían dos
 * definiciones de "canónico" que arrancan iguales y se separan en el primer
 * arreglo apurado.
 */
function resolveViewerRoute(
  listing: ListingUrlParts,
  photoNumber: number,
  requestedPath: string,
): { readonly kind: "render" } | { readonly kind: "redirect"; readonly to: string } {
  // La barra final no es otra ruta: es la misma escrita distinto.
  const requested = requestedPath.replace(/\/+$/, "");
  const suffix = `/${PHOTO_SEGMENT}/${photoNumber}`;

  // Cuando el sufijo no coincide exactamente, el número venía escrito de otra
  // forma (`/foto/02`): se deja la ruta entera del lado del aviso, que
  // entonces no puede ser la canónica, y la redirección lo corrige de una vez.
  const listingPath = requested.endsWith(suffix) ? requested.slice(0, -suffix.length) : requested;
  const route = resolveListingRoute(listing, listingPath);

  return route.kind === "render"
    ? { kind: "render" }
    : { kind: "redirect", to: `${route.to}${suffix}` };
}
