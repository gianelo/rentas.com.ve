import { cookies } from "next/headers";
import type { LegacyPublicationDraftPort } from "@/modules/listing-publication/application/ports/legacy-publication-draft.port";
import type { PublicationDraftDependencies } from "@/modules/listing-publication/application/publication-draft-session";
import { DrizzlePublicationDraftStore } from "@/modules/listing-publication/infrastructure/drizzle-publication-draft-store";
import { db } from "@/shared/db/client";
import { DRAFT_COOKIE, DRAFT_COOKIE_PATH, DRAFT_TEXT_COOKIE, parseStoredDraft } from "./draft";

/**
 * La raíz de composición del borrador: quién contesta cada puerto (tasks.md 18.30).
 *
 * **`db` y no el cliente transaccional.** Las tres operaciones son de una sola
 * sentencia —un `SELECT`, un upsert sobre la primaria, un `DELETE`—, así que no
 * hay nada que tenga que salir o fallar junto; y leer el borrador pasa en CADA
 * pantalla de las nueve, que es exactamente el camino de lectura del que habla el
 * argumento de latencia de D2.
 *
 * **El borrado nombra el `path`, y no es prolijidad.** Las dos cookies se
 * escribieron bajo `/publicar`; `delete(nombre)` a secas pone una cookie vencida
 * en `/` y deja viva la de `/publicar`. Ése era el modo de falla exacto que este
 * puente existe para cerrar — una segunda fuente del mismo borrador — y estaba
 * en el `publishFromReview` anterior, que borraba sin decir el `path`.
 *
 * Todo este archivo se va con la 18.33.
 */
export const legacyDraftCookies: LegacyPublicationDraftPort = {
  async read() {
    const store = await cookies();
    return parseStoredDraft(store.get(DRAFT_COOKIE)?.value, store.get(DRAFT_TEXT_COOKIE)?.value);
  },

  async clear() {
    const store = await cookies();
    for (const name of [DRAFT_COOKIE, DRAFT_TEXT_COOKIE]) {
      store.delete({ name, path: DRAFT_COOKIE_PATH });
    }
  },
};

export function publicationDraftDependencies(): PublicationDraftDependencies {
  return { store: new DrizzlePublicationDraftStore(db), legacy: legacyDraftCookies };
}
