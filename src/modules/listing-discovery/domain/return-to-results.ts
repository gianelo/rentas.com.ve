import { slugify } from "./listing-url";

/**
 * De dónde vino quien está mirando un aviso, y a dónde lo devuelve la ficha
 * (tarea 16.9).
 *
 * **El defecto que esto cierra lo encontró el fundador usando el sitio.** La
 * ficha tenía un «← Resultados» clavado en `/alquiler/<ciudad>/<zona>`, sin
 * mirar de dónde venía nadie. Entrando desde el inicio, esa flecha mandaba a
 * una pantalla de resultados donde el visitante nunca estuvo — *«un botón de
 * atrás que me manda a un lugar con una barra de filtros y todo»* —, y entrando
 * desde una búsqueda filtrada perdía los filtros y devolvía la zona pelada.
 *
 * **La URL de la ficha es canónica y no lleva estado de búsqueda** (11.1: sólo
 * el id identifica un aviso), así que la ficha no puede deducir el origen: la
 * única manera es que viaje con el enlace de ida. Va como un parámetro de query
 * en el enlace a la ficha, y es un enlace — funciona con JavaScript apagado
 * (D13/F14). Lo que NO se usa, y es decisión: `history.back()` no sabe si hay
 * algo atrás, y `document.referrer` no llega en todos los casos ni se puede
 * probar.
 *
 * **Es una regla de negocio y por eso vive acá.** A dónde se puede mandar a una
 * persona lo decide el producto, no la plantilla — la misma razón que puso
 * `safe-return-destination.ts` en el dominio de identidad, con la misma
 * consecuencia práctica: el suelo de cobertura del 90 % llega a `domain/` y no
 * llega a `app/`.
 *
 * **El destino lo manda el navegador**, así que es entrada de quien envía. Sin
 * la regla de abajo, «← Resultados» es un redirector abierto: un enlace de
 * rentas.com.ve que deja a quien lo toca en cualquier parte. Ya pasó una vez
 * acá, en la acción de revelar el contacto, y lo caro no fue el salto — fue que
 * el enlace se veía nuestro, que es exactamente lo que un phishing necesita.
 */

/**
 * El nombre del parámetro, **exportado a propósito**: lo escribe el enlace de
 * ida y lo lee la ficha, y esos dos lados desacordados no rompen nada visible
 * — la ficha se dibuja igual y el enlace de vuelta cae en el respaldo sin que
 * nadie vea un error. Con una sola constante importada por los dos, ese
 * desacuerdo deja de ser expresable.
 *
 * Corto y en español, como el resto de la query del sitio (F12: `ciudad`,
 * `zona`, `min`, `max`, `hab`, `pag`).
 */
export const RETURN_PARAM = "volver";

/**
 * Un origen que no existe. Nunca se emite: sólo sirve para que `URL` acepte una
 * ruta relativa y para tener contra qué comparar el origen del candidato.
 */
const SAME_ORIGIN = "https://destino.invalid";

/** Las pantallas de las que se sale hacia un aviso: la zona y el inicio. */
const RESULTS_PREFIX = "/alquiler/";
const HOME = "/";

export interface ResultsPlace {
  readonly cityName: string;
  readonly zoneName: string;
}

export interface ResultsLink {
  readonly href: string;
  readonly label: string;
}

/**
 * El origen tal como se puede usar, o `null` cuando no se puede.
 *
 * **Se resuelve parseando, no comparando prefijos de texto**, que es la lección
 * que ya se pagó una vez. Un prefijo deja pasar `/signin?callbackUrl=https…`,
 * donde la ruta es la nuestra y lo hostil viaja adentro del parámetro. Parsear
 * contra un origen inventado hace que cualquier candidato que traiga su propio
 * origen — `https://evil.test/…`, `//evil.test/…`, `/\evil.test` que el
 * navegador normaliza a `//evil.test`, `javascript:` que no tiene origen —
 * salga con un origen distinto y se caiga solo, sin una lista de esquemas que
 * alguien tenga que mantener.
 *
 * Se devuelve `pathname + search` y no el texto que llegó: es la misma
 * dirección ya normalizada, sin el fragmento — que no es estado de búsqueda —
 * ni nada que el parseo haya descartado por el camino.
 */
export function safeResultsOrigin(
  candidate: string | readonly string[] | undefined,
): string | null {
  // El mismo parámetro puede llegar dos veces: lo arma quien envía. Gana el
  // primero, que es el que el enlace de ida escribió; el segundo sólo puede
  // ser de alguien que armó la dirección a mano.
  const raw = Array.isArray(candidate) ? candidate[0] : (candidate as string | undefined);
  const value = raw?.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value, SAME_ORIGIN);
  } catch {
    // Basura que ni siquiera parsea. Lanzar acá le daría una pantalla rota a
    // alguien que sólo quería volver a los resultados.
    return null;
  }

  if (url.origin !== SAME_ORIGIN) return null;

  // **Lista blanca de pantallas de resultados, no de rutas nuestras.** Una ruta
  // interna cualquiera pasa la comprobación de origen y sigue siendo el destino
  // equivocado: un botón que dice «Resultados» tiene que llevar a resultados.
  // La barra final del prefijo importa — sin ella `/alquilerx` entraría.
  const isResults = url.pathname === HOME || url.pathname.startsWith(RESULTS_PREFIX);
  if (!isResults) return null;

  return `${url.pathname}${url.search}`;
}

/**
 * El enlace de ida: la ruta del aviso con el origen colgado.
 *
 * **Valida antes de emitir**, y de ahí sale la invariante que ata los dos
 * lados: todo lo que esta función escribe, `safeResultsOrigin` lo acepta. Un
 * origen que el lector fuera a rechazar no se cuelga — sería un parámetro que
 * viaja por toda la cuadrícula para terminar descartado.
 */
export function withResultsOrigin(
  listingPath: string,
  candidate: string | readonly string[] | undefined,
): string {
  const origin = safeResultsOrigin(candidate);
  if (origin === null) return listingPath;

  // `URLSearchParams` codifica las barras y el `?` del origen. Sin codificar,
  // el `&min=200` del origen sería un segundo parámetro de la ficha y el
  // destino llegaría cortado a la mitad.
  return `${listingPath}?${new URLSearchParams({ [RETURN_PARAM]: origin })}`;
}

/**
 * El enlace de vuelta de la ficha: a dónde va y qué dice.
 *
 * **Las dos cosas juntas son la regla, no sólo el destino.** Sin origen no hay
 * vuelta que prometer: quien llegó desde Google o desde el inicio nunca estuvo
 * en una pantalla de resultados, y una flecha «← Resultados» le miente. El
 * respaldo es la zona del propio aviso — existe, es canónica porque se arma con
 * la misma `slugify` que la ruta del aviso, y es donde sigue buscando quien
 * llegó buscando acá —, y su texto no dice «volver».
 */
export function resultsLink(
  candidate: string | readonly string[] | undefined,
  place: ResultsPlace,
): ResultsLink {
  const origin = safeResultsOrigin(candidate);

  if (origin === null) {
    return {
      href: `${RESULTS_PREFIX}${slugify(place.cityName)}/${slugify(place.zoneName)}`,
      label: `Ver avisos en ${place.zoneName}`,
    };
  }

  return { href: origin, label: "← Resultados" };
}
