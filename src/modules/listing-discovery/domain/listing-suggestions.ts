/**
 * A quién se le ofrece una salida cuando la ficha que se abrió ya venció
 * (tareas 11.10 y 11.12; `design.md`, "Expiry is an SEO liability").
 *
 * **Quien llega acá es el visitante más valioso que el sitio recibe**, y por
 * eso esta decisión existe: escribió la zona exacta y la intención exacta en
 * Google, tocó un resultado, y del otro lado hay un apartamento que ya no está.
 * Un 404 lo tira a la calle. La ficha vencida se sirve con 200, dice que
 * venció, y le pone enfrente lo que sí está activo.
 *
 * **Dos reglas, y la segunda es la que no se puede aflojar.**
 *
 * 1. Se empieza por la zona y se amplía a la ciudad una sola vez.
 * 2. **Nunca más allá de la ciudad.** Es el mismo aislamiento absoluto que
 *    `ListingSearchPort` sostiene con su `cityId` obligatorio, y acá se sostiene
 *    con la forma de los tipos en vez de con un comentario: `suggestFromZone`
 *    puede pedir ampliar, `suggestFromCity` no puede. No hay un tercer paso que
 *    escribir mal — no hay un tercer paso.
 *
 * Puro a propósito, como el resto de este dominio: recibe las filas que alguien
 * más buscó y no sabe que existe una base de datos. Quién las buscó y en qué
 * orden lo orquesta `application/suggest-active-listings.ts`.
 */

/**
 * Cuántas se ofrecen.
 *
 * **Cuatro porque la cuadrícula dibuja dos columnas en el teléfono y cuatro en
 * escritorio**: cuatro tarjetas son una fila entera en escritorio y dos filas
 * limpias en el teléfono, sin una quinta suelta. Más que eso convierte la ficha
 * vencida en una segunda pantalla de resultados — que ya existe, es mejor que
 * ésta para buscar, y está a un enlace de distancia.
 */
export const SUGGESTION_LIMIT = 4;

/** Hasta dónde se llegó a buscar. `none` es una respuesta, no un error. */
export type SuggestionScope = "zone" | "city" | "none";

/**
 * Lo mínimo que hace falta saber de un candidato para decidir esto: su
 * identidad, para no ofrecer el aviso que ya se está mirando.
 *
 * **Genérico y no un tipo propio**, porque lo que la pantalla dibuja son las
 * filas completas que devolvió la búsqueda. Copiarlas a una forma de este
 * módulo sería un segundo lugar donde se decide qué lleva una tarjeta.
 */
export interface SuggestibleListing {
  readonly id: string;
}

export interface SuggestionOutcome<T extends SuggestibleListing> {
  readonly scope: SuggestionScope;
  readonly listings: readonly T[];
}

/**
 * El resultado de mirar la zona: o alcanzó, o hay que ampliar.
 *
 * `widen` no lleva datos porque no hay nada que llevar — quién busca la ciudad
 * es el caso de uso, y qué hacer con lo que traiga lo decide `suggestFromCity`.
 */
export type ZoneSuggestionStep<T extends SuggestibleListing> =
  | { readonly kind: "resolved"; readonly outcome: SuggestionOutcome<T> }
  | { readonly kind: "widen" };

/**
 * La primera parada. **La exclusión del propio aviso ocurre antes de decidir si
 * se amplía**, y ese orden es la mitad de la regla: una zona cuyo único activo
 * es el aviso que se está mirando no tiene salida que ofrecer, y resolver ahí
 * dibujaría un enlace de vuelta a la misma página vencida.
 */
export function suggestFromZone<T extends SuggestibleListing>(
  candidates: readonly T[],
  viewedListingId: string,
  limit: number = SUGGESTION_LIMIT,
): ZoneSuggestionStep<T> {
  const listings = pick(candidates, viewedListingId, limit);

  return listings.length === 0
    ? { kind: "widen" }
    : { kind: "resolved", outcome: { scope: "zone", listings } };
}

/**
 * La segunda parada, y **la última que existe**. Sin avisos activos en la
 * ciudad la respuesta es `none`: ofrecer uno de la otra ciudad sería peor que
 * no ofrecer ninguno, porque quien buscaba en Maracaibo no se muda a Caracas
 * porque una ficha vencida se lo sugirió.
 */
export function suggestFromCity<T extends SuggestibleListing>(
  candidates: readonly T[],
  viewedListingId: string,
  limit: number = SUGGESTION_LIMIT,
): SuggestionOutcome<T> {
  const listings = pick(candidates, viewedListingId, limit);

  return listings.length === 0 ? { scope: "none", listings: [] } : { scope: "city", listings };
}

/**
 * Saca el aviso que se está mirando y corta en el tope, **conservando el orden
 * que trajo la búsqueda**. Reordenar acá sería una segunda regla de orden
 * compitiendo en silencio con el `ORDER BY` del adaptador, que es la misma
 * razón por la que `buildListingGrid` tampoco reordena.
 */
function pick<T extends SuggestibleListing>(
  candidates: readonly T[],
  viewedListingId: string,
  limit: number,
): readonly T[] {
  const chosen: T[] = [];

  for (const candidate of candidates) {
    if (chosen.length >= limit) break;
    if (candidate.id === viewedListingId) continue;
    chosen.push(candidate);
  }

  return chosen;
}

/**
 * Lo que la ficha vencida escribe encima de las sugerencias.
 *
 * **Vive acá y no en la página por la mitad que sólo se ve cuando se amplía.**
 * Escrito una sola vez, «Otros avisos en Tierra Negra» queda encima de cuatro
 * tarjetas de Bella Vista, y nadie lo nota: en el caso común es verdad. El
 * encabezado tiene que decir el alcance real de lo que hay debajo, y el alcance
 * lo decidió este mismo módulo — separarlos es garantizar que un día discrepen.
 *
 * `null` en vez de una cadena vacía: sin sugerencias no hay encabezado, y un
 * `<h2>` hueco encima de nada es peor que ninguno.
 */
export function suggestionHeading(
  scope: SuggestionScope,
  place: { readonly zoneName: string; readonly cityName: string },
): string | null {
  switch (scope) {
    case "zone":
      return `Otros avisos activos en ${place.zoneName}`;
    case "city":
      // Dice las dos cosas: que en la zona buscada no quedó nada —que es la
      // respuesta a lo que la persona vino a preguntar— y de dónde es lo que
      // sí hay. Callar la primera mitad haría pasar la ciudad por la zona.
      return `No quedan avisos activos en ${place.zoneName}. Otros en ${place.cityName}`;
    case "none":
      return null;
  }
}
