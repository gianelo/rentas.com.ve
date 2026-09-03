/**
 * Las zonas que tienen avisos activos, con su conteo — **de las dos ciudades**
 * (tasks.md 14.52).
 *
 * ## Por qué es un puerto nuevo y no un método más en otro
 *
 * AGENTS.md §3, textual: *"cuando necesitás leer de una tabla cuyo puerto de
 * escritura es deliberadamente angosto, agregá un puerto de lectura al lado; no
 * ensanches el de escritura"*. Acá el vecino angosto es `HomeCollectionsPort`,
 * que contesta *colecciones* —cuatro tiras de cinco filas con su total— y cuyo
 * `collectionsFor` es plural justamente para que nadie pueda pedirle una cosa a
 * la vez. Meterle un `zonesWithListings()` le agregaría una segunda pregunta que
 * no tiene nada que ver con una tira, y su firma dejaría de decir lo que hace.
 *
 * Tampoco es `FacetedSearchPort`: aquél cuenta **bajo un criterio**, y
 * `SearchCriteria` exige una ciudad (5.5/5.6). El inicio no tiene ciudad
 * elegida, así que pedirle esto obligaría a admitir un criterio "sin ciudad" —
 * que es exactamente lo que ese tipo prohíbe para que el aislamiento de ciudad
 * no dependa de que alguien se acuerde.
 *
 * ## Sin argumentos, y eso es la decisión
 *
 * No recibe ciudad ni texto. **Ni una consulta por tecla** (14.51: un `fetch`
 * por pulsación es un viaje real desde Venezuela, que es lo que la 14.11 existe
 * para no pagar) y **ni una consulta por ciudad**: una sola respuesta, la misma
 * para todo el mundo, cacheable con la página. Un parámetro de texto acá sería
 * la forma que `DrizzleSearchVocabulary` ya cubre en el servidor al enviar.
 */

/** Una zona con avisos, ya contada. Es lo que una sugerencia necesita saber. */
export interface ActiveZone {
  readonly id: string;
  readonly name: string;
  readonly cityId: string;
  /** La parroquia o el municipio: lo que desambigua un nombre repetido (14.18). */
  readonly parentName: string | null;
  /**
   * Cuántos avisos activos tiene.
   *
   * **Nunca cero.** Una zona sin avisos no tiene fila que agrupar, así que no
   * está — y ésa es la garantía, no un filtro que el llamador aplique después:
   * ofrecer una zona vacía manda a una pantalla sin salida (regla transversal
   * 4). Un `0` explícito sería un dato, y el dato sería el equivocado.
   */
  readonly count: number;
}

export interface ActiveZonesPort {
  /**
   * Todas, de las dos ciudades, en una llamada.
   *
   * Es el vocabulario acotado del inicio: en `/` no hay ciudad elegida ni
   * facetas de dónde sacarlo, que es la razón por la que la 14.51 no llegó a la
   * portada. Son decenas de filas y no miles — el corte no es un `LIMIT`, es
   * «tener avisos».
   */
  listActiveZones(): Promise<readonly ActiveZone[]>;
}
