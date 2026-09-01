/**
 * tasks.md 18.32 — **la variante sin filtro que `PublicationDraftStorePort` no
 * tiene, al lado y no adentro** (AGENTS.md §3). Aquél contesta tres preguntas
 * sobre la fila de UNA sesión y su `WHERE` lleva siempre `publisher_id`; el
 * barrido pregunta lo contrario —«cuáles vencieron, de quien sea»— y darle ese
 * método a aquél le pondría al flujo de publicar una lectura global que nunca
 * pidió. Es el mismo reparto que `ListingPhotoOrderPort` y su hermana.
 *
 * **Devuelve claves y NADA más.** `answers` lleva la descripción de 1.200
 * caracteres de cada borrador y el barrido no la mira: por eso la 18.29 dejó
 * `photos` en su propia columna.
 */
export interface ExpiredDraftPhotos {
  /** La primaria de `publish_draft`, que es también con lo que se borra la fila. */
  readonly publisherId: string;
  /** Las claves de R2 que esa fila nombra. Vacío cuando el borrador no llegó al paso 8. */
  readonly photoKeys: readonly string[];
}

export interface ExpiredPublicationDraftsPort {
  /**
   * **El borde se cierra hacia el vencimiento, igual que `hasDraftExpired`**:
   * vencido es `expires_at <= now`, exactamente el complemento del
   * `expires_at > now` con el que `load` filtra. En el instante exacto el
   * barrido ve la fila y quien vuelve ya no, así que ninguna transacción
   * devuelve un borrador cuyas claves la otra está borrando.
   */
  listExpired(now: Date): Promise<readonly ExpiredDraftPhotos[]>;
}
