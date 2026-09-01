import type { StoredPublicationDraft } from "../../domain/publication-steps";

/**
 * tasks.md 18.29 — el borrador de los nueve pasos guardado con la sesión como
 * llave, la dependencia que `app/publicar/draft.ts` dejó anotada el día que lo
 * metió en dos cookies de treinta minutos.
 *
 * **Tres preguntas y ninguna más**, sobre la misma fila y la misma llave. Publicar
 * exige sesión —`page.tsx` y `actions.ts` llaman a `requireSession` antes que nada—,
 * así que `publisherId` sale de ahí y **este puerto no tiene una versión sin filtro**.
 * Uno solo y no la pareja lectura/escritura de `verified_contact`, porque acá las tres
 * se hacen desde el mismo flujo. **El barrido de las 24 horas NO entra acá**
 * (AGENTS.md §3): «cuáles vencieron, de quien sea» es esa variante sin filtro.
 */
export interface PublicationDraftStorePort {
  /** **`now` es del llamador y el vencido no vuelve**: el `expires_at > $now` es
   *  parte de la consulta, no algo que el llamador pueda saltearse. El borde lo
   *  razona `hasDraftExpired`, cerrado hacia el vencimiento. */
  load(publisherId: string, now: Date): Promise<StoredPublicationDraft | null>;

  /** Escribe el borrador entero y corre el vencimiento. **Es un upsert sobre la
   *  primaria, y por eso «empezar de nuevo descarta lo anterior» no depende de que
   *  nadie se acuerde.** Reemplaza, nunca fusiona: el merge por paso ya lo hace
   *  `applyStepAnswers`. `expiresAt` lo calcula el caso de uso con `draftExpiresAt`,
   *  igual que `DrizzleListingRepository.save` recibe su `publishedAt`. */
  save(publisherId: string, draft: StoredPublicationDraft, expiresAt: Date): Promise<void>;

  /** Sin fila no pasa nada, y eso hace que publicar y abandonar terminen igual. **No
   *  borra fotos de R2** (18.23): el barrido lee las claves ANTES de borrar la fila. */
  discard(publisherId: string): Promise<void>;
}
