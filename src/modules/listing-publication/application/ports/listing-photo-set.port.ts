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
