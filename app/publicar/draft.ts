import type { PublicationDraftDependencies } from "@/modules/listing-publication/application/publication-draft-session";
import { DrizzlePublicationDraftStore } from "@/modules/listing-publication/infrastructure/drizzle-publication-draft-store";
import { db } from "@/shared/db/client";
import type { StoredPublicationDraft } from "../../src/modules/listing-publication/domain/publication-steps";

/**
 * El borrador visto desde `app/`: su forma vacía y **quién contesta su puerto**
 * (tasks.md 18.30/18.33).
 *
 * Ya no queda nada de cookie. Las dos —`rentas_publish_draft` y
 * `rentas_publish_texto`— vivían acá con su lista blanca y su base64url; el
 * borrador es hoy una fila de `publish_draft` con la sesión como llave, y **nada
 * de este flujo lee ni escribe una cookie**. El puente de una entrega que la
 * 18.30 dejó preparado se sacó sin usarse: el sitio no está publicado, así que
 * no había ningún borrador de cookie vivo que rescatar.
 *
 * **`db` y no el cliente transaccional.** Las tres operaciones son de una sola
 * sentencia —un `SELECT`, un upsert sobre la primaria, un `DELETE`—, así que no
 * hay nada que tenga que salir o fallar junto; y leer el borrador pasa en CADA
 * pantalla de las nueve, que es exactamente el camino de lectura del que habla el
 * argumento de latencia de D2.
 */

/** El mismo tipo. La forma se mudó al dominio (18.29) para que el puerto de la
 *  tabla no dependa de `app/`. */
export type StoredDraft = StoredPublicationDraft;

export function emptyDraft(): StoredDraft {
  return { listing: {}, photos: [], violations: [] };
}

export function publicationDraftDependencies(): PublicationDraftDependencies {
  return { store: new DrizzlePublicationDraftStore(db) };
}
