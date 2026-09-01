import { draftExpiresAt } from "../domain/draft-expiry";
import type { StoredPublicationDraft } from "../domain/publication-steps";
import { normaliseStoredDraft } from "../domain/stored-draft";
import type { LegacyPublicationDraftPort } from "./ports/legacy-publication-draft.port";
import type { PublicationDraftStorePort } from "./ports/publication-draft-store.port";

/**
 * El borrador de los nueve pasos, con la tabla como única fuente (tasks.md 18.30).
 *
 * Tres funciones, y las tres existen para que **una sola regla** no quede
 * repartida entre cuatro archivos de `app/`: la tabla gana, la cookie es un
 * respaldo de lectura, y escribir la tabla mata la cookie. Repartida, cada
 * pantalla acertaría por su cuenta hasta el día en que una no.
 */
export interface PublicationDraftDependencies {
  readonly store: PublicationDraftStorePort;
  readonly legacy: LegacyPublicationDraftPort;
}

/**
 * **Sin efectos, a propósito.** Lo llaman componentes de servidor, y ahí Next no
 * deja escribir ni borrar cookies: migrar acá sería un 500 en el paso 1. La
 * migración ocurre sola en el primer guardado, que es lo primero que hace quien
 * retoma.
 *
 * El orden —tabla, después cookie— es lo único que impide que una cookie vieja
 * del mismo navegador pise lo que la persona acaba de guardar.
 *
 * **La fila se normaliza igual que la cookie.** El tipo del puerto promete una
 * forma; la fila la escribió el formulario de ayer y vuelve con la forma de ayer.
 * Falla cerrado por campo, no por borrador (AGENTS.md §7): lo que no encaja se
 * descarta y lo demás sobrevive. Una fila que no es un borrador en absoluto vale
 * como no tener ninguno, que es un formulario vacío y se recupera.
 */
export async function readPublicationDraft(
  publisherId: string,
  now: Date,
  { store, legacy }: PublicationDraftDependencies,
): Promise<StoredPublicationDraft | null> {
  const row = await store.load(publisherId, now);
  if (row !== null) return normaliseStoredDraft(row);

  return legacy.read();
}

/**
 * Guarda y **corre el vencimiento**, que es la segunda mitad de la frase del
 * fundador: quien vuelve retoma donde estaba.
 *
 * La cookie se borra DESPUÉS de que la fila existe, nunca antes. Borrarla primero
 * dejaría a quien publica sin ninguna de las dos fuentes por una falla de la base
 * en la que no tuvo parte — el mismo criterio con el que `publishFromReview` sólo
 * limpiaba después de una escritura buena.
 */
export async function savePublicationDraft(
  publisherId: string,
  draft: StoredPublicationDraft,
  now: Date,
  { store, legacy }: PublicationDraftDependencies,
): Promise<void> {
  await store.save(publisherId, draft, draftExpiresAt(now));
  await legacy.clear();
}

/** Publicar y abandonar terminan igual: sin fila y sin cookie. Dejar la cookie
 *  acá haría que el aviso recién publicado volviera como borrador. */
export async function discardPublicationDraft(
  publisherId: string,
  { store, legacy }: PublicationDraftDependencies,
): Promise<void> {
  await store.discard(publisherId);
  await legacy.clear();
}
