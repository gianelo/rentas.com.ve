import type { EditableListingSnapshot, ListingEditWrite } from "../../domain/listing-edit";

/**
 * tasks.md 18.14 — leer y reescribir un aviso YA PUBLICADO.
 *
 * **Un puerto al lado, no un ensanchamiento** (AGENTS.md §3).
 * `ListingRepositoryPort.save` inserta una fila nueva y
 * `ListingActivationPort` lee un borrador para voltearlo; esto lee un aviso
 * activo y reescribe ocho de sus columnas. Son tres operaciones distintas
 * sobre la misma tabla, y plegar la tercera en cualquiera de las otras dos le
 * pondría a todos sus llamadores una forma que no usan.
 */
export interface EditableListing extends EditableListingSnapshot {
  readonly id: string;
  readonly publisherId: string;
}

export interface ListingEditPort {
  /**
   * **`publisher_id` y `status = 'active'` van EN el `WHERE`, no filtrados
   * después** — el mismo idioma que `findRevealable` y `findDraftById` ya
   * usan. Un aviso de otra cuenta, un borrador, uno vencido, uno oculto por
   * reportes y uno que no existe se contestan todos con el mismo `null`.
   *
   * **Vencido y oculto quedan afuera a propósito, y no es una omisión.** Una
   * edición que pudiera tocarlos sería el camino por el que un aviso apagado
   * por tres denunciantes distintos vuelve solo — exactamente lo que el
   * `WHERE status = 'active'` de `markExpired` se escribió para cerrar. El
   * camino de vuelta de un vencido es renovar, que es su propia decisión con
   * su propio ciclo; el de un oculto no existe todavía.
   */
  findEditableById(listingId: string, publisherId: string): Promise<EditableListing | null>;

  /**
   * `true` si la fila seguía siendo de esta cuenta y activa en el instante
   * del `UPDATE`. El mismo compare-and-swap que `activate` y `renew`: los dos
   * guardas van en la escritura, no sólo en la lectura que la precedió, o dos
   * pedidos simultáneos podrían los dos creer que ganaron.
   */
  applyEdit(listingId: string, publisherId: string, write: ListingEditWrite): Promise<boolean>;
}
