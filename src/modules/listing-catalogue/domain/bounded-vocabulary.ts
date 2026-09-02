import type { SuggestionVocabulary } from "./suggest-filters";

/**
 * **El vocabulario acotado: sólo las zonas con avisos activos, con su conteo**
 * (tasks.md 14.51, que es la 14.35 con la forma que sí entra).
 *
 * ## Por qué no es la taxonomía entera, y el número que lo decidió
 *
 * La 14.35 pedía «~2 KB filtrados en el cliente». Medido sobre los datos que
 * este repositorio tiene —`docs/territorio/`, 888 KB en 9 archivos— son 10
 * municipios, 81 parroquias y **4.710 topónimos**: 89,8 KB gzip enteros, y
 * 30,1 KB recortados al hueso, contra unos 20 KB de margen en el camino de
 * lectura. No entra ni en su forma mínima, y su forma mínima además dejaría de
 * ser un par (filtro, valor) con su ámbito, que es la regla de la 14.18.
 *
 * Lo que sí entra son **decenas y no miles**: las zonas que tienen avisos. Y
 * recortar por ahí no es una degradación — sugerir una zona vacía manda a una
 * pantalla sin salida (regla transversal 4), así que la sugerencia que se
 * pierde es justo la que no debía ofrecerse.
 *
 * ## De dónde salen los datos: de la página, sin un byte nuevo
 *
 * En las dos rutas de búsqueda ese conjunto **ya viajó**: `buildFilterPanel`
 * devuelve `counts.byZone`, que la 14.11 trae en la MISMA consulta que las
 * filas y el resto de las facetas. Esta función no pide nada; junta lo que la
 * pantalla ya tiene.
 *
 * ## Lo que deliberadamente NO lleva
 *
 * **Los alias.** Los 4.710 del «Índice de topónimos» no están en la pantalla de
 * resultados, y traerlos costaría una consulta más en la ruta más transitada
 * del producto. La consecuencia está aceptada por escrito en la 14.51: con el
 * script cargado se sugiere MENOS que lo que el servidor encuentra al enviar.
 * El piso no cambia — la pastilla sigue siendo un `<form method="get">` y
 * `resolveSearchDestination` sigue resolviendo en el servidor sobre el
 * vocabulario completo, alias incluidos.
 *
 * ## Dónde vive, y por qué acá
 *
 * En `listing-catalogue`, que es de quien las dos partes ya toman
 * `SuggestionVocabulary`. Ponerla en `listing-search` cerraría un ciclo entre
 * módulos: el catálogo ya depende de la búsqueda (`buildSearchHref`), y la
 * vuelta lo haría mutuo. Es la misma razón que `SearchVocabularyPort` deja
 * escrita para su duplicación con `ZoneVocabularyPort`.
 */

/** Lo poco que hace falta saber de una zona del catálogo para ofrecerla. */
export interface CatalogueZoneName {
  readonly id: string;
  readonly name: string;
  readonly cityId: string;
  /** La parroquia o el municipio: lo que desambigua un nombre repetido (14.18). */
  readonly parentName: string | null;
}

export function boundedVocabulary(
  cities: readonly { readonly id: string; readonly name: string }[],
  zones: readonly CatalogueZoneName[],
  /** Avisos activos por zona. Es `counts.byZone`, tal como llega de la consulta. */
  byZone: Readonly<Record<string, number>>,
): SuggestionVocabulary {
  return {
    // **Las dos ciudades del producto van siempre**, aunque ninguna tenga
    // conteo: son dos filas, y son lo que el dominio ofrece cuando alguien
    // escribió filtros sin nombrar un lugar («apartamento amoblado»). Sin ellas
    // esa rama de `searchChoices` deja de existir. Es la misma decisión que
    // `DrizzleSearchVocabulary` ya tomó del lado del servidor.
    cities,
    // **El aislamiento de ciudad no se vuelve a decidir acá** (D5/F2). Entra lo
    // que el conteo nombra, y el conteo pertenece a la ciudad del criterio —
    // una segunda regla de ciudad escrita en esta función sería una segunda
    // oportunidad de escribirla mal, y las dos tendrían que coincidir para
    // siempre.
    //
    // `flatMap` y no `filter` + `map`: con los dos, la condición se escribe una
    // vez y el conteo se vuelve a buscar en la otra, y esa segunda búsqueda
    // arrastra un `?? 0` que ya no puede pasar — una rama que ninguna prueba
    // puede poner en rojo porque es inalcanzable.
    zones: zones.flatMap((zone) => {
      const count = byZone[zone.id] ?? 0;
      return count > 0 ? [{ ...zone, count }] : [];
    }),
    aliases: [],
  };
}
