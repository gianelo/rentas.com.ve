import { slugify } from "../../listing-discovery/domain/listing-url";

/**
 * **El slug de una zona, y qué valor de `?zona=` nombra a cuál.**
 *
 * La dirección ES el estado de la búsqueda (F12), y el documento del fundador
 * la escribe legible: `?zona=chacao,altamira`. Hasta acá viajaba el `id`, que
 * es un hash con forma de UUID, así que con dos zonas la dirección quedaba
 * `?zona=9f1c0d2e-0000-4000-8000-000000000001,4da5ef52-…` — ilegible para
 * quien la lee en un chat, que es como circulan los avisos.
 *
 * **El id no se reemplaza: se le suma un slug.** El id sigue siendo la clave
 * real — es lo que indexa `counts.byZone` y lo que `countFacets` recibe— y
 * cambiarlo por el slug rompería las dos cosas. Son dos datos distintos de la
 * misma zona: uno identifica, el otro se lee.
 *
 * **Por qué vive en el dominio y no en la página.** Es la regla permanente del
 * fundador: una regla de negocio nunca vive en el frente. Y tiene además la
 * razón mecánica de siempre — el suelo de cobertura del 90 % llega a `domain/`
 * y no llega a `app/`, así que una regla escrita en una página es una regla que
 * ninguna corrida de tests puede poner en rojo.
 *
 * `slugify` se importa de `listing-discovery` en vez de copiarse, y eso es
 * deliberado: es la misma función con la que `resolveZoneRoute` resuelve el
 * segmento de la ruta y con la que `buildListingPath` arma la de la ficha. Dos
 * copias que hoy coinciden dejan de coincidir con el primer topónimo raro, y
 * ahí `?zona=` dejaría de nombrar la zona que la ruta nombra. El repositorio ya
 * hace exactamente este import desde `listing-catalogue` y `listing-publication`.
 */

/** Lo que la búsqueda necesita saber de una zona del catálogo. */
export interface SearchZone {
  readonly id: string;
  readonly cityId: string;
  readonly name: string;
  /** El nombre legible: el que viaja en `?zona=` y el último segmento de su ruta. */
  readonly slug: string;
}

/** Las zonas del catálogo con su slug ya calculado. */
export function toSearchZones<Z extends { id: string; cityId: string; name: string }>(
  zones: readonly Z[],
): readonly SearchZone[] {
  return zones.map((zone) => ({
    id: zone.id,
    cityId: zone.cityId,
    name: zone.name,
    slug: slugify(zone.name),
  }));
}

/**
 * Si un valor de `?zona=` nombra a esta zona.
 *
 * **Se aceptan las dos formas, y no por un tiempo.** El slug es la forma
 * canónica y la única que se emite; el id se sigue reconociendo porque la
 * dirección es el estado de la búsqueda y ya hay direcciones con ids pegadas
 * en chats de WhatsApp desde que existe la selección múltiple. Romperlas
 * devolvería la ciudad entera sin decir por qué se perdió la zona — el mismo
 * "vacío sin explicación" que `readZoneIds` evita del otro lado.
 *
 * No se emite un redirect a la forma canónica y esa decisión también es
 * deliberada: una dirección con filtros ya sale del índice
 * (`isFilteredZoneRoute`), así que no hay contenido duplicado que evitar, y el
 * redirect costaría un viaje más en cada enlace viejo compartido.
 *
 * **Las dos formas no pueden chocar.** Un slug es `[a-z0-9-]` derivado de un
 * topónimo y un id es un hash; y aunque chocaran, los dos se buscan en la misma
 * lista ya recortada a UNA ciudad, así que el resultado sería igualmente una
 * zona real de esa ciudad.
 */
export function zoneMatchesToken(zone: { id: string; slug: string }, token: string): boolean {
  if (token === "") return false;
  return zone.slug === token || zone.id === token;
}

/**
 * Las zonas que nombra `?zona=`, **dentro de UNA ciudad**.
 *
 * El recorte por ciudad es la mitad de la regla, no una precaución: «Centro»
 * existe en Maracaibo y en Distrito Capital, y un slug solo no las distingue.
 * Sí las distingue dentro de una ciudad, y la ciudad siempre está en la ruta —
 * por eso esta función la exige en vez de deducirla.
 *
 * En el orden en que la dirección las nombra, sin repetir: la misma zona
 * nombrada dos veces —por su id en un enlace viejo y por su slug en el
 * refinamiento de después— es una sola zona marcada, no dos.
 */
export function resolveZoneTokens(
  tokens: readonly string[],
  zones: readonly SearchZone[],
  cityId: string,
): readonly SearchZone[] {
  const kept: SearchZone[] = [];

  for (const raw of tokens) {
    const token = raw.trim();
    const zone = zones.find(
      (candidate) => candidate.cityId === cityId && zoneMatchesToken(candidate, token),
    );
    // Lo que no nombra ninguna zona de esta ciudad se cae solo, y la búsqueda
    // sigue viva: una dirección de hace un mes puede llevar una zona que la
    // taxonomía ya no tiene.
    if (zone && !kept.includes(zone)) kept.push(zone);
  }

  return kept;
}
