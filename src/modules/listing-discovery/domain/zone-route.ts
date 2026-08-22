import { slugify } from "./listing-url";

/**
 * Qué lugar nombra `/alquiler/<ciudad>/<zona>`.
 *
 * **Existe porque la 14.24 borró `/buscar`.** Toda búsqueda lleva un `cityId`
 * obligatorio — `ListingSearchPort` lo garantiza a nivel de tipo — así que
 * toda búsqueda posible cae en una ruta de lugar, y la página de zona *es* la
 * búsqueda de esa zona sin filtros. Eso deja una pregunta que antes no
 * existía: **traducir dos segmentos legibles a los dos ids con los que se
 * consulta**, y ésa es una regla, no un formateo.
 *
 * Vive acá y no en la página por la regla permanente del fundador: una regla
 * de negocio nunca vive en el frente. También por una razón práctica — el
 * suelo de cobertura del 90 % llega a `domain/` y no llega a `app/`.
 *
 * Los dos segmentos se resuelven **juntos**, y eso es el diseño entero: la
 * zona sola es ambigua. `Centro` existe en Maracaibo y en Distrito Capital;
 * resolverla sin su ciudad devuelve la del otro extremo del país, y bajo el
 * aislamiento por ciudad la búsqueda sale vacía sin que nadie pueda ver por
 * qué.
 */

/** La forma mínima que esta regla necesita de una ciudad del catálogo. */
export interface RoutableCity {
  readonly id: string;
  readonly name: string;
}

/** La forma mínima que esta regla necesita de una zona del catálogo. */
export interface RoutableZone {
  readonly id: string;
  readonly name: string;
  readonly cityId: string;
}

export interface ZoneRoute<
  C extends RoutableCity = RoutableCity,
  Z extends RoutableZone = RoutableZone,
> {
  readonly city: C;
  readonly zone: Z;
}

/**
 * `null` cuando los segmentos no nombran un lugar curado, y **nunca una
 * ciudad por defecto**.
 *
 * La tentación es caer a la primera ciudad, como hace el inicio cuando nadie
 * eligió todavía. Acá sería lo contrario de eso: el inicio no tiene un lugar
 * en la URL y tiene que elegir uno; esta ruta *afirma* un lugar. Responder 200
 * con los avisos de otra parte publica contenido duplicado bajo una dirección
 * inventada — la misma penalización que la 11.1 evita del otro lado, en la
 * ficha — y le miente a quien leyó la URL antes de tocarla.
 *
 * Se compara contra `slugify(nombre)` y no contra el nombre: mayúsculas,
 * acentos y espacios no son parte de una ruta, y `buildListingPath` ya emite
 * exactamente esa forma. Que las dos direcciones usen la misma función es lo
 * que hace que el enlace «← Resultados» de la ficha caiga siempre en una ruta
 * que resuelve.
 */
export function resolveZoneRoute<C extends RoutableCity, Z extends RoutableZone>(
  cities: readonly C[],
  zones: readonly Z[],
  citySlug: string,
  zoneSlug: string,
): ZoneRoute<C, Z> | null {
  if (citySlug.trim() === "" || zoneSlug.trim() === "") return null;

  const city = cities.find((candidate) => slugify(candidate.name) === citySlug);
  if (!city) return null;

  const zone = zones.find(
    (candidate) => candidate.cityId === city.id && slugify(candidate.name) === zoneSlug,
  );
  if (!zone) return null;

  return { city, zone };
}

/**
 * Los filtros volátiles que viajan en la query, y **sólo ellos**.
 *
 * El lugar va en la ruta y los filtros en la query — eso lo decidió la 14.24
 * mirando cómo escribe Airbnb sus URLs. La consecuencia que la misma tarea
 * anota es una regla de indexación *mecánica*: sin parámetros la dirección es
 * la zona y se indexa; con parámetros es una refinada, y las refinadas son
 * combinatorias.
 */
export const FILTER_KEYS = [
  // Los tres originales.
  "min",
  "max",
  "hab",
  // Zonas EXTRA sobre la que ya afirma la ruta: la query sólo puede ensanchar
  // la búsqueda, y ensancharla la vuelve otra página.
  "zona",
  "tipo",
  "pub",
  // Los cinco atributos, con los nombres cortos del fundador (F12).
  "planta",
  "agua",
  "amoblado",
  "vigilancia",
  "electro",
  // **La paginación también.** La página 2 es contenido casi idéntico al de la
  // 1, y no se pierde nada indexándola: va con `follow`, así que Google llega
  // igual a cada ficha — y cada ficha está en el sitemap por su cuenta.
  "pag",
] as const;

/**
 * Si esta ruta lleva filtros aplicados.
 *
 * Se mira sólo la lista de arriba y no "cualquier parámetro": `utm_source`
 * viene pegado en cada enlace compartido, y contarlo como filtro haría que
 * pasar la zona por WhatsApp la sacara del índice de Google. Un parámetro
 * presente pero vacío tampoco cuenta — eso es lo que deja un formulario `GET`
 * cuyo campo nadie llenó, y no filtra nada.
 */
export function isFilteredZoneRoute(query: Record<string, string | undefined>): boolean {
  return FILTER_KEYS.some((key) => (query[key] ?? "").trim() !== "");
}

/**
 * Qué ciudad nombra `/alquiler/<ciudad>`.
 *
 * **Existe porque el inicio la necesita.** La placa «Ver los 23» de cada tira
 * de ciudad apunta acá, y hasta que esta ruta resolviera, esa placa era un
 * enlace roto — lo mismo que la miga de pan de la página de zona evita
 * dejando la ciudad sin enlace, con esa razón escrita al lado.
 *
 * `null` para una ciudad que el catálogo no tiene, y **nunca la primera**. Es
 * la misma asimetría que documenta `resolveZoneRoute`: el inicio no tiene un
 * lugar en la URL y tiene que elegir uno; esta ruta *afirma* un lugar, y
 * responder 200 con los avisos de otra parte publica contenido duplicado bajo
 * una dirección inventada.
 */
export function resolveCityRoute<C extends RoutableCity>(
  cities: readonly C[],
  citySlug: string,
): C | null {
  if (citySlug.trim() === "") return null;

  return cities.find((candidate) => slugify(candidate.name) === citySlug) ?? null;
}
