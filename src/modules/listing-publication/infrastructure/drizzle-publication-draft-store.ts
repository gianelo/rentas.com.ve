import { and, eq, gt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { publishDrafts } from "../../../shared/db/schema";
import type { PublicationDraftStorePort } from "../application/ports/publication-draft-store.port";
import type { DraftPhoto, StoredPublicationDraft } from "../domain/publication-steps";

/** Producción pasa el cliente de Neon y la prueba de integración un pool de
 *  `node-postgres`: las dos corren este mismo código. */
export type PublicationDraftDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Lo que va a `answers`: el borrador sin las fotos, que tienen columna propia. */
type StoredAnswers = Omit<StoredPublicationDraft, "photos">;

/**
 * tasks.md 18.29 — una fila por cuenta y ninguna decisión adentro. **Ningún método
 * sin `publisher_id` en el `WHERE`**, el idioma que `DrizzlePublisherListings` usa.
 * **La fila no se valida campo por campo**, a diferencia de `parseStoredDraft`:
 * aquélla desconfía porque una cookie viaja por el navegador, y ésta la escribió el
 * servidor con la sesión comprobada.
 */
export class DrizzlePublicationDraftStore implements PublicationDraftStorePort {
  constructor(private readonly db: PublicationDraftDatabase) {}

  async load(publisherId: string, now: Date): Promise<StoredPublicationDraft | null> {
    const rows = await this.db
      .select({ answers: publishDrafts.answers, photos: publishDrafts.photos })
      .from(publishDrafts)
      // En el `WHERE` y no en un `if` posterior: un borrador vencido nunca llega a
      // existir en memoria, así que no hay rama donde alguien lo devuelva por error.
      .where(and(eq(publishDrafts.publisherId, publisherId), gt(publishDrafts.expiresAt, now)))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return null;

    // Las fotos pisan lo que venga de `answers`: la columna es la fuente, y así
    // una fila vieja que las llevara adentro no puede contradecirla.
    return { ...(row.answers as StoredAnswers), photos: row.photos as readonly DraftPhoto[] };
  }

  /** El upsert sobre la primaria es donde «empezar de nuevo descarta lo anterior»
   *  deja de ser trabajo de nadie: no hay lectura previa que alguien pueda olvidar.
   *  Mismo criterio que `DrizzleVerifiedContacts.record`. */
  async save(publisherId: string, draft: StoredPublicationDraft, expiresAt: Date): Promise<void> {
    const { photos, ...answers } = draft;

    await this.db
      .insert(publishDrafts)
      .values({ publisherId, answers, photos, expiresAt })
      .onConflictDoUpdate({
        target: publishDrafts.publisherId,
        set: { answers, photos, expiresAt },
      });
  }

  /** `DELETE` de cero filas no es un error: descartar es repetible sin preguntar. */
  async discard(publisherId: string): Promise<void> {
    await this.db.delete(publishDrafts).where(eq(publishDrafts.publisherId, publisherId));
  }
}
