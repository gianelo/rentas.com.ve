import { draftExpiresAt, hasDraftExpired } from "../domain/draft-expiry";
import type { StoredPublicationDraft } from "../domain/publication-steps";
import { normaliseStoredDraft } from "../domain/stored-draft";
import type { ExpiredDraftSignalPort } from "./ports/expired-draft-signal.port";
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

export interface ExpiredDraftSignalDependencies {
  readonly expiry: ExpiredDraftSignalPort;
}

export interface PublicationDraftReading {
  readonly draft: StoredPublicationDraft | null;
  /** Hubo un borrador y se venció. Nunca «no hay fila»: son cosas distintas. */
  readonly expired: boolean;
}

/**
 * tasks.md 18.34 — **el borrador, y cuando no hay, si es que se venció.**
 *
 * Hasta acá vencido y nunca empezado eran el mismo observable: `load` filtra en
 * el `WHERE` y quien volvía a las 25 horas caía en el paso 1 con el formulario en
 * blanco y sin una frase que lo explicara — el mismo modo de falla que la cookie
 * de treinta minutos tenía, sólo que 48 veces más raro.
 *
 * **Las dos salidas que la 18.34 nombraba, y por qué gana ésta.** La otra era
 * sacar el `expires_at > $ahora` del `WHERE` y dejar que el dominio decidiera
 * sobre la fila devuelta: más barato en líneas, pero deshace una garantía
 * embarcada —que un borrador vencido no llegue a existir en memoria— justo
 * cuando el barrido de la 18.32 borra de R2 las fotos de esa fila. Devolver un
 * borrador cuyas claves otra transacción está borrando es la única forma de
 * llegar a revisar un aviso al que le faltan imágenes (AGENTS.md §7). Acá el
 * filtro se queda y se agrega una lectura al lado.
 *
 * **La segunda consulta sólo ocurre cuando no hay borrador**, que es el caso
 * raro: quien está a mitad de publicar no paga nada. Y la condición vive acá, en
 * el módulo, y no en la pantalla: escrita en `app/` sería una regla de producto
 * fuera del piso del 90 % (AGENTS.md §1).
 */
export async function readPublicationDraftOrExpiry(
  publisherId: string,
  now: Date,
  dependencies: PublicationDraftDependencies & ExpiredDraftSignalDependencies,
): Promise<PublicationDraftReading> {
  const draft = await readPublicationDraft(publisherId, now, dependencies);
  if (draft !== null) return { draft, expired: false };

  const expiresAt = await dependencies.expiry.findExpiry(publisherId);

  // **El primer llamador de `hasDraftExpired`**, que embarcó en el #186 con sus
  // pruebas y sin nadie que la usara. El puerto trae la fecha; el borde
  // —cerrado hacia el vencimiento— lo sigue razonando el dominio, en un solo
  // lugar. Sin fila no hay nada que se haya vencido: es alguien que nunca empezó.
  return { draft: null, expired: expiresAt !== null && hasDraftExpired(expiresAt, now) };
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
