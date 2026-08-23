/**
 * Las colecciones del inicio, leídas.
 *
 * Separado del puerto de búsqueda a propósito: aquél contesta una consulta con
 * criterios que alguien eligió, y éste contesta varias colecciones fijas que el
 * dominio decidió. Mezclarlos obligaría a `SearchCriteria` a admitir "sin
 * ciudad", que es justo lo que su tipo prohíbe.
 */

/**
 * Una fila tal como la dibuja una tarjeta, **con los dos nombres ya resueltos**.
 *
 * `cityName` y `zoneName` y no sus ids: la ruta de cada tarjeta se arma con los
 * nombres, y una tira cruza muchas zonas — devolver ids obligaría a la página a
 * cargar la taxonomía entera y a construir dos `Map` para traducirlos, que es
 * una consulta más y un pedazo de la regla de rutas fuera del dominio.
 *
 * Estructuralmente es el `GridListing` que `buildListingGrid` consume. Se
 * declara acá con su forma mínima en vez de importarlo: esto es la capa de
 * aplicación, y el dominio no debería depender de quién lo llama ni al revés.
 */
export interface HomeCollectionRow {
  readonly id: string;
  readonly title: string;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly areaM2: number;
  readonly publisherType: "owner" | "broker";
  readonly cityName: string;
  readonly zoneName: string;
}

/**
 * Lo que el adaptador tiene que ir a buscar por colección. Es el
 * `HomeCollectionSpec` del dominio recortado a lo que una consulta usa: el
 * título y la dirección son de la pantalla y no tienen nada que hacer en un
 * `WHERE`.
 */
export interface HomeCollectionRequest {
  readonly key: string;
  /** `null` = la colección cruza las ciudades. Nunca "se me olvidó". */
  readonly cityId: string | null;
  /** `null` = sin techo de precio. */
  readonly maxPriceUsd: number | null;
  readonly limit: number;
}

/**
 * **Las filas Y el total, en el mismo tipo, y ésa es toda la garantía.**
 *
 * La placa del inicio dice "Ver los 23" y la regla transversal del producto es
 * que ese 23 sea verdad. Un puerto que devolviera sólo `rows` dejaría a la
 * pantalla contándolas, y contar las filas de un `LIMIT 5` da 5 — el número que
 * la placa justamente no puede decir. Con los dos campos en el tipo, componer
 * la placa a partir de lo que hay en pantalla deja de ser una tentación y pasa
 * a ser un dato que ya está.
 *
 * `total` cuenta bajo **exactamente el mismo predicado** que produjo `rows`,
 * portada incluida. Dos predicados distintos son dos respuestas distintas, y la
 * diferencia entre ellas es la mentira.
 */
export interface HomeCollectionPage {
  readonly rows: readonly HomeCollectionRow[];
  readonly total: number;
  /**
   * **Cuántas zonas distintas hay detrás de la colección, y por qué también es
   * del puerto.**
   *
   * El subtítulo de la tira de ciudad dice «23 avisos activos en **cuatro**
   * zonas», y ese cuatro cae bajo la misma regla transversal que el 23: tiene
   * que ser verdad. Contarlo sobre `rows` daría como mucho cinco zonas —el
   * `LIMIT` de la tira— y en la práctica daría el número de zonas que
   * casualmente tocaron los cinco avisos más nuevos, que no es ninguna
   * respuesta.
   *
   * Cuenta bajo **exactamente el mismo predicado** que produjo `rows` y
   * `total`, portada incluida: una zona cuyos únicos avisos están vencidos o
   * sin foto no es una zona donde haya algo que ver.
   */
  readonly zoneCount: number;
}

export interface HomeCollectionsPort {
  /**
   * TODAS las colecciones en una llamada, y el plural es la decisión.
   *
   * **Son cuatro colecciones y crecen con el catálogo.** Pedirlas de a una son
   * cuatro viajes de red contra Neon, que es HTTP, y una quinta ciudad los
   * vuelve cinco — el N+1 clásico pagado en latencia, en la página que más
   * gente ve. La firma lo hace inexpresable: no existe un `collectionFor(spec)`
   * singular al que caer.
   *
   * Devuelve un `Map` indexado por `key` y no un arreglo: el llamador ya tiene
   * sus colecciones en el orden que decidió el dominio y lo único que necesita
   * es buscar por clave.
   *
   * **Una colección sin avisos simplemente no está en el `Map`.** No es un
   * error: que la tira desaparezca es una regla del dominio, y decidirlo es del
   * llamador, no de acá.
   */
  collectionsFor(
    requests: readonly HomeCollectionRequest[],
  ): Promise<ReadonlyMap<string, HomeCollectionPage>>;
}
