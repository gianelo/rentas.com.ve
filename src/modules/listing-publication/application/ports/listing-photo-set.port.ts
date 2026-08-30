/**
 * tasks.md 18.21 — leer el orden de las fotos de un aviso y desprender una.
 *
 * **Dos interfaces AL LADO de `ListingPhotoAttachmentPort`, ninguna adentro
 * de él** (AGENTS.md §3). Aquel puerto tiene un solo método —`attachPhoto`—
 * porque escribe una foto sobre una fila que ya existe, y ésa es toda su
 * responsabilidad; agregarle `detachPhoto` lo convertiría en «el puerto de
 * las fotos» y le pondría a `attachPhotoToDraft`, que sólo adjunta, una
 * capacidad de borrado que nunca pidió. Es la misma razón por la que
 * `ContactRevealEventPort` sigue teniendo sólo `record()`.
 *
 * La lectura va aparte de la escritura por la misma regla: cuando hace falta
 * leer de una tabla cuyo puerto de escritura es angosto a propósito, se
 * agrega un puerto de lectura al lado.
 */

/**
 * Los identificadores de las fotos del aviso **en el orden en que se
 * muestran**, que es el orden de `position` ascendente y por lo tanto pone la
 * portada primero (`COVER_PHOTO_INDEX`).
 *
 * Devuelve el arreglo que `planPhotoRemoval` recibe tal cual: el dominio ya
 * dice que «el orden de la lista ES el orden del aviso y la primera ES la
 * portada», así que traducir posiciones acá sería una segunda manera de decir
 * lo mismo.
 */
export interface ListingPhotoOrderPort {
  listPhotoIdsInOrder(listingId: string): Promise<readonly string[]>;
}

/**
 * tasks.md 18.26 — una foto del aviso **con lo único que hace falta para
 * dibujarla**: su id, que es lo que el formulario de quitar manda, y la clave
 * de R2 de su miniatura.
 *
 * **`thumb` y sólo `thumb`, no el `Record` de los cinco tamaños que
 * `ListingPhotoView` devuelve.** Aquél existe porque la tarjeta, la tira y el
 * visor eligen tamaños distintos sobre la misma lectura; acá hay una sola
 * superficie y un solo tamaño, y devolver cinco claves para usar una
 * convertiría en dato lo que es una decisión de esta pantalla.
 *
 * **`null` cuando la derivada no está, en vez de omitir la foto.** Es la
 * diferencia entre una miniatura que falta y una foto que desaparece: el
 * renglón es el ÚNICO camino para quitarla, así que filtrarla dejaría una fila
 * que el aviso muestra y su dueño no puede sacar (AGENTS.md §7).
 */
export interface ListingPhotoThumbnail {
  readonly photoId: string;
  readonly thumbKey: string | null;
}

/**
 * **Un puerto de lectura al lado, no un método más en `ListingPhotoOrderPort`.**
 * Aquél contesta una sola pregunta —en qué orden van— y `planPhotoRemoval`
 * recibe su arreglo tal cual; agregarle las claves de R2 le pondría a
 * `detachPhotoFromListing`, que sólo necesita el orden, un join contra
 * `listing_photo_derivative` que nunca pidió. Es la misma razón por la que la
 * escritura de las fotos se quedó partida en dos puertos y no en uno.
 */
export interface ListingPhotoThumbnailPort {
  /**
   * En el orden en que se muestran, o sea `position` ascendente: la portada
   * primero, igual que `listPhotoIdsInOrder`. La posición no viaja como
   * columna porque el índice del arreglo YA es la posición, y dos fuentes para
   * el mismo número es como una pantalla termina diciendo «Foto 3» sobre la
   * segunda.
   */
  listPhotoThumbnailsInOrder(listingId: string): Promise<readonly ListingPhotoThumbnail[]>;
}

export interface ListingPhotoDetachmentPort {
  /**
   * Borra la fila y **renumera las que quedan dentro de la MISMA
   * transacción**, así que el aviso nunca queda con un hueco en `position`.
   *
   * La renumeración no es cosmética: `listing_photo_position_unique` es sobre
   * `(listing_id, position)` y el siguiente adjuntar reclama `position =`
   * cuántas fotos hay. Quitar la del medio de tres dejaría `{0, 2}` con dos
   * filas, y el próximo adjuntar pediría la 2 y chocaría contra el índice.
   *
   * Es también lo que hace verdadero en la base el «quitar la portada
   * asciende a la siguiente» que `planPhotoRemoval` ya decide en memoria: la
   * portada es la de `position` más baja, y renumerar es lo que la mueve.
   *
   * `false` cuando la fila ya no estaba —el mismo compare-and-swap que
   * `applyEdit` y `activate`—, para que el caso de uso conteste como ante un
   * aviso inexistente en vez de afirmar que borró algo.
   */
  detachPhoto(listingId: string, photoId: string): Promise<boolean>;
}
