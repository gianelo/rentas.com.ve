import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { publishDrafts } from "../../../shared/db/schema";
import type { ExpiredDraftSignalPort } from "../application/ports/expired-draft-signal.port";
import type {
  ExpiredDraftPhotos,
  ExpiredPublicationDraftsPort,
} from "../application/ports/expired-publication-drafts.port";
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
 * **La fila no se valida acá**, y no porque nadie la valide: `readPublicationDraft`
 * le pasa cada fila a `normaliseStoredDraft` antes de devolverla. La forma la
 * decide el dominio, no el adaptador que la trae.
 */
export class DrizzlePublicationDraftStore
  implements PublicationDraftStorePort, ExpiredDraftSignalPort
{
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

  /**
   * tasks.md 18.34 — **el vencimiento de la fila, sin juzgarlo.**
   *
   * Vive en esta clase y no en `DrizzleExpiredPublicationDrafts` por el criterio
   * que separó a las dos: aquélla existe para ser la ÚNICA consulta sin
   * `publisher_id` en el `WHERE`, y ésta lo lleva. Y no rompe el invariante de
   * `load` —«un borrador vencido nunca llega a existir en memoria»— porque no
   * devuelve un borrador: devuelve una fecha.
   *
   * **Sin `expires_at` en el `WHERE`, a propósito.** Filtrar acá escribiría por
   * tercera vez en SQL el borde que `hasDraftExpired` ya razona entero, y las
   * tres tendrían que quedar de acuerdo para siempre.
   */
  async findExpiry(publisherId: string): Promise<Date | null> {
    const rows = await this.db
      .select({ expiresAt: publishDrafts.expiresAt })
      .from(publishDrafts)
      .where(eq(publishDrafts.publisherId, publisherId))
      .limit(1);

    return rows[0]?.expiresAt ?? null;
  }

  /** `DELETE` de cero filas no es un error: descartar es repetible sin preguntar. */
  async discard(publisherId: string): Promise<void> {
    await this.db.delete(publishDrafts).where(eq(publishDrafts.publisherId, publisherId));
  }
}

/**
 * tasks.md 18.32 — **la única consulta de esta tabla sin `publisher_id` en el
 * `WHERE`**, y por eso vive en una clase aparte y no como un cuarto método de
 * `DrizzlePublicationDraftStore`: aquélla tiene por invariante que ningún método
 * suyo lee la fila de otra cuenta, y ésta pregunta justamente lo contrario.
 */
export class DrizzleExpiredPublicationDrafts implements ExpiredPublicationDraftsPort {
  constructor(private readonly db: PublicationDraftDatabase) {}

  /**
   * **`jsonb_path_query_array` y no la columna entera.** Trae sólo las claves,
   * así que `answers` —con la descripción de 1.200 caracteres de cada borrador
   * abandonado— nunca cruza la red. Es la consulta que la 18.29 corrió en verde
   * y dejó anotada para acá.
   *
   * **`<=` y no `<`**: vencido es el complemento exacto del `expires_at > $ahora`
   * con el que `load` filtra, así que en el instante justo la fila la ve el
   * barrido y no quien vuelve. Es el mismo borde que `hasDraftExpired`.
   */
  async listExpired(now: Date): Promise<readonly ExpiredDraftPhotos[]> {
    const rows = await this.db
      .select({
        publisherId: publishDrafts.publisherId,
        photoKeys: sql<
          string[] | null
        >`jsonb_path_query_array(${publishDrafts.photos}, '$[*].key')`,
      })
      .from(publishDrafts)
      .where(lte(publishDrafts.expiresAt, now));

    // Una fila guardada antes de que `photos` fuera un arreglo de objetos con
    // `key` devuelve `[]`, nunca `null`: el barrido borra su fila igual.
    return rows.map((row) => ({ publisherId: row.publisherId, photoKeys: row.photoKeys ?? [] }));
  }
}
