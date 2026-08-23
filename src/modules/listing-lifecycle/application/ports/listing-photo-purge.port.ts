/**
 * La purga de fotos de los avisos vencidos hace más de 15 días (19c, 19.4).
 *
 * **Sólo fotos. La fila del aviso no aparece en esta interfaz**, y no por
 * disciplina sino porque no es expresable: no hay un `deleteListing` al que
 * caer. 19c lo decidió con el número al lado — una fila de aviso pesa ~600
 * bytes en Postgres y las fotos son prácticamente el 100% del peso en R2, así
 * que borrar la fila no compra nada y cuesta la URL que Google ya indexó, el
 * estado vencido que el diseño dibuja y la evidencia de la métrica.
 *
 * **Las claves de R2 salen ANTES de borrar las filas.** Al revés se pierde el
 * único índice de qué objetos quedaron huérfanos, y esos bytes ya no los
 * recupera nadie: son exactamente los que la retención existe para liberar.
 */

export interface PurgeCandidate {
  readonly listingId: string;
  readonly photoIds: readonly string[];
  /** Cada derivada de cada foto, para borrarlas del bucket. */
  readonly objectKeys: readonly string[];
}

export interface ListingPhotoPurgePort {
  /** Avisos vencidos antes del corte que todavía tienen fotos. */
  candidates(purgeBefore: Date): Promise<readonly PurgeCandidate[]>;

  /**
   * Borra las filas de foto. Las derivadas y el hash se van con ellas por
   * `ON DELETE cascade`, que ya está en el esquema desde la 0009.
   */
  deletePhotos(photoIds: readonly string[]): Promise<number>;
}
