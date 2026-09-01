import { draftExpiresAt } from "../domain/draft-expiry";
import type { StoredPublicationDraft } from "../domain/publication-steps";
import { normaliseStoredDraft } from "../domain/stored-draft";
import type { PublicationDraftStorePort } from "./ports/publication-draft-store.port";

/**
 * El borrador de los nueve pasos, con la tabla como única fuente (tasks.md 18.30).
 *
 * Tres funciones, y las tres existen para que **una sola regla** no quede
 * repartida entre cuatro archivos de `app/`: qué se acepta de una fila y cuánto
 * vive lo que se guarda. Repartida, cada pantalla acertaría por su cuenta hasta
 * el día en que una no.
 */
export interface PublicationDraftDependencies {
  readonly store: PublicationDraftStorePort;
}

/**
 * **La fila se normaliza siempre.** El tipo del puerto promete una forma; la fila
 * la escribió el formulario de ayer y vuelve con la forma de ayer. Falla cerrado
 * por campo, no por borrador (AGENTS.md §7): lo que no encaja se descarta y lo
 * demás sobrevive. Una fila que no es un borrador en absoluto vale como no tener
 * ninguno, que es un formulario vacío y se recupera.
 *
 * **Sin efectos**, porque lo llaman componentes de servidor: ahí Next no deja
 * tocar cookies ni cabeceras, y un efecto acá sería un 500 en el paso 1.
 */
export async function readPublicationDraft(
  publisherId: string,
  now: Date,
  { store }: PublicationDraftDependencies,
): Promise<StoredPublicationDraft | null> {
  const row = await store.load(publisherId, now);

  return row === null ? null : normaliseStoredDraft(row);
}

/**
 * Guarda y **corre el vencimiento**, que es la segunda mitad de la frase del
 * fundador: quien vuelve retoma donde estaba.
 *
 * El plazo lo pone `draftExpiresAt` y no esta función: la ventana de 24 horas es
 * del dominio, y escrita acá volvería a ser un número que alguien copia.
 */
export async function savePublicationDraft(
  publisherId: string,
  draft: StoredPublicationDraft,
  now: Date,
  { store }: PublicationDraftDependencies,
): Promise<void> {
  await store.save(publisherId, draft, draftExpiresAt(now));
}

/** Publicar y abandonar terminan igual: sin fila. Dejar algo acá haría que el
 *  aviso recién publicado volviera como borrador. */
export async function discardPublicationDraft(
  publisherId: string,
  { store }: PublicationDraftDependencies,
): Promise<void> {
  await store.discard(publisherId);
}
