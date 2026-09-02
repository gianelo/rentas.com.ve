import type { ExpiredPublicationDraftsPort } from "./ports/expired-publication-drafts.port";
import type { PublicationDraftStorePort } from "./ports/publication-draft-store.port";

/**
 * tasks.md 18.32 — **el barrido de las 24 horas**, la mitad que da valor a la
 * tabla de la 18.29: «a las 24 horas se limpia una publicación abandonada»
 * (fundador, 2026-09-01).
 *
 * **El orden es el diseño entero: las claves se leen ANTES de borrar la fila.**
 * La fila es lo ÚNICO que nombra esos objetos —viven bajo el prefijo promovido,
 * donde también viven las fotos de todos los avisos activos, así que ninguna
 * regla de ciclo de vida del bucket los distingue—, y borrarla primero fabrica
 * de forma permanente el huérfano que este barrido existe para quitar.
 *
 * **Y si R2 rechaza, la fila se queda** (AGENTS.md §7: el modo de falla
 * preferido es la negativa). Se desvía a propósito de `purgeExpiredPhotos`, que
 * borra las filas aunque falle el objeto: allá la clave también vive en
 * `listing_photo_derivative` de un aviso que la pantalla dibuja, acá la fila es
 * el único registro que existe. Una fila vencida es invisible —`load` filtra
 * por `expires_at > $ahora`— y pesa unos cientos de bytes, así que conservarla
 * cuesta eso y la corrida de mañana la vuelve a nombrar; borrarla cuesta los
 * bytes de R2 para siempre.
 *
 * **No escribe en `job_run`.** Ese libro es de `listing-lifecycle` y su puerto
 * no cruza a este módulo; los cuatro contadores salen por la respuesta de la
 * ruta, que es lo que el cron lee.
 */

/** Sólo lo que el barrido necesita de R2, igual que `PurgeObjectStoragePort`. */
export interface SweepObjectStoragePort {
  remove(key: string): Promise<void>;
}

export interface SweepExpiredDraftsDependencies {
  readonly drafts: ExpiredPublicationDraftsPort;
  /**
   * **El `discard` que ya existe, no un borrado nuevo.** Es exactamente esta
   * operación —`DELETE ... WHERE publisher_id = $1`— y darle al barrido una
   * segunda sería tener dos maneras de borrar la misma fila.
   */
  readonly store: Pick<PublicationDraftStorePort, "discard">;
  readonly objectStorage: SweepObjectStoragePort;
  readonly now?: () => Date;
}

export interface SweepResult {
  readonly selected: number;
  readonly draftsDeleted: number;
  readonly objectsRemoved: number;
  readonly failed: number;
}

export async function sweepExpiredDrafts(
  dependencies: SweepExpiredDraftsDependencies,
): Promise<SweepResult> {
  const { drafts, store, objectStorage } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  const expired = await drafts.listExpired(now());

  let objectsRemoved = 0;
  let draftsDeleted = 0;
  let failed = 0;

  for (const draft of expired) {
    let everyKeyRemoved = true;

    for (const key of draft.photoKeys) {
      try {
        await objectStorage.remove(key);
        objectsRemoved += 1;
      } catch {
        // Se sigue con las demás claves del mismo borrador: una que ya no está
        // en R2 no debe dejar a las otras pagadas.
        everyKeyRemoved = false;
        failed += 1;
      }
    }

    if (!everyKeyRemoved) continue;

    try {
      await store.discard(draft.publisherId);
      draftsDeleted += 1;
    } catch {
      // Una base que corta no debe cancelar el resto de la corrida: los otros
      // borradores vencidos siguen siendo objetos pagados.
      failed += 1;
    }
  }

  return { selected: expired.length, draftsDeleted, objectsRemoved, failed };
}
