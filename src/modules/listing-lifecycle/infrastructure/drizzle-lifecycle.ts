import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lt, lte, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import {
  jobRuns,
  listingPhotoDerivatives,
  listingPhotos,
  listingReminders,
  listings,
  users,
} from "../../../shared/db/schema";
import type { JobRunPort, JobRunRecord } from "../application/ports/job-run.port";
import type {
  LifecycleListing,
  LifecycleListingsPort,
  RenewableListing,
  RenewRequest,
} from "../application/ports/lifecycle-listings.port";
import type {
  ListingPhotoPurgePort,
  PurgeCandidate,
} from "../application/ports/listing-photo-purge.port";
import type { ReminderClaim, ReminderLedgerPort } from "../application/ports/reminder-ledger.port";
import {
  ANNOUNCED_LIFECYCLE_STATUSES,
  EXPIRY_NOTICE_WINDOW_DAYS,
  PURGE_GRACE_DAYS,
  PURGE_NOTICE_LEAD_DAYS,
} from "../domain/expiry";

/**
 * El ciclo de vida contra Postgres real.
 *
 * El handle entra por constructor, no por import: producción le pasa el
 * cliente de Neon y `tests/integration/lifecycle.test.ts` le pasa uno de
 * `node-postgres` apuntando a un contenedor, y **corre este mismo código**
 * (mismo razonamiento que `drizzle-contact-reveal.ts`).
 */
export type LifecycleDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function daysFrom(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MILLISECONDS_PER_DAY);
}

export class DrizzleLifecycleListings implements LifecycleListingsPort {
  constructor(private readonly db: LifecycleDatabase) {}

  /**
   * `UPDATE … WHERE status = 'active' AND expires_at < now`.
   *
   * **`hidden` no se toca.** Un aviso escondido por reportes que venciera
   * pasaría a `expired`, y renovarlo lo devolvería a `active` — el camino por
   * el que un aviso reportado se lava solo. El filtro por `active` cierra ese
   * camino en la consulta y no en un comentario.
   *
   * **Ésta es LA EXCEPCIÓN a la regla de la 21.1, y es deliberada.** Los
   * lectores del catálogo —búsqueda, facetas, revelado, sitemap— filtran por
   * las dos condiciones porque su pregunta es «¿esto sigue vigente?», y el
   * rótulo se atrasa. Acá la pregunta es la contraria: el trabajo existe
   * justamente para encontrar las filas cuyo rótulo quedó viejo, así que
   * `status = 'active'` no es un descuido sino el sujeto de la consulta.
   * Agregarle `expires_at > now()` la dejaría sin una sola fila que
   * actualizar y el rótulo no volvería a moverse nunca.
   */
  async markExpired(now: Date): Promise<number> {
    const updated = await this.db
      .update(listings)
      .set({ status: "expired" })
      .where(and(eq(listings.status, "active"), lt(listings.expiresAt, now)))
      .returning({ id: listings.id });
    return updated.length;
  }

  /**
   * Los candidatos de las DOS ventanas en una sola consulta.
   *
   * La franja va desde «vence dentro de 5 días» hasta «se purga dentro de 5»,
   * y `noticeDueFor` decide cuál de los dos correos toca — o ninguno, para el
   * hueco del medio. La base trae de más a propósito: el corte fino es una
   * regla de producto y no pertenece a un `WHERE`.
   *
   * `hidden` y `draft` quedan afuera, y desde la 19.16 por la misma lista que
   * usa la purga (`ANNOUNCED_LIFECYCLE_STATUSES`): a un aviso escondido por
   * reportes no se le ofrece renovar, y el `expires_at` de un borrador es un
   * marcador de posición que la activación reescribe.
   */
  async noticeCandidates(now: Date): Promise<readonly LifecycleListing[]> {
    const upperBound = daysFrom(now, EXPIRY_NOTICE_WINDOW_DAYS);
    const lowerBound = daysFrom(now, -(PURGE_GRACE_DAYS - PURGE_NOTICE_LEAD_DAYS));

    return this.db
      .select({
        id: listings.id,
        title: listings.title,
        expiresAt: listings.expiresAt,
        publisherEmail: users.email,
      })
      .from(listings)
      .innerJoin(users, eq(users.id, listings.publisherId))
      .where(
        and(
          inArray(listings.status, [...ANNOUNCED_LIFECYCLE_STATUSES]),
          lte(listings.expiresAt, upperBound),
          gt(listings.expiresAt, lowerBound),
        ),
      );
  }

  /**
   * broker-bulk-import spec, "Drafts Are Not Published Listings" (tasks.md
   * 9.18/9.19) — the decision `RenewableListing.status`'s own comment
   * deferred to this task. **Resolved as an explicit refusal, not left as
   * "unreachable by construction".** Nothing today mints a renewal token
   * for a draft — `noticeCandidates` only ever selects `active`/`expired` —
   * so this guard changes no observable behaviour yet. It exists anyway
   * because AGENTS.md's own "fail closed" section names exactly this shape:
   * prefer the guard that refuses over the one that merely happens to never
   * be exercised. `ne(status, 'draft')` costs one predicate on an id lookup
   * and closes the path BEFORE a future caller could ever open it, rather
   * than leaving it to be reopened silently the day something new mints a
   * token from a wider set of listings than `noticeCandidates` does today.
   *
   * Same `null`-covers-everything-excluded idiom `findRevealable` already
   * uses: a draft, a genuinely missing id, and (once one exists) a removed
   * listing are indistinguishable to whoever calls this.
   */
  async findRenewable(listingId: string): Promise<RenewableListing | null> {
    const rows = await this.db
      .select({
        id: listings.id,
        title: listings.title,
        status: listings.status,
        expiresAt: listings.expiresAt,
      })
      .from(listings)
      .where(and(eq(listings.id, listingId), ne(listings.status, "draft")))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * La renovación y la quema del token, en un solo `UPDATE`.
   *
   * `expires_at = expectedExpiresAt` en el `WHERE` es lo que hace el token de
   * un solo uso: al renovar, la columna se mueve y el mismo token deja de
   * encajar. Sin leer antes, así que no hay ventana en la que dos clics
   * simultáneos ganen los dos.
   *
   * **`expired` vuelve a `active`; `hidden` se queda como está.** Un aviso
   * escondido por reportes no se destraba renovando.
   */
  async renew(request: RenewRequest): Promise<boolean> {
    const updated = await this.db
      .update(listings)
      .set({
        expiresAt: request.newExpiresAt,
        lastRenewedAt: request.renewedAt,
        status: sql`CASE WHEN ${listings.status} = 'expired' THEN 'active' ELSE ${listings.status} END`,
      })
      .where(
        and(eq(listings.id, request.listingId), eq(listings.expiresAt, request.expectedExpiresAt)),
      )
      .returning({ id: listings.id });

    return updated.length > 0;
  }
}

/**
 * El libro de correos enviados.
 *
 * **`ON CONFLICT DO NOTHING` + `RETURNING`, y ahí está toda la garantía.** Un
 * `INSERT` que devuelve filas ganó la carrera; uno que devuelve cero perdió
 * contra la restricción única. No hay lectura previa, así que no hay ventana
 * en la que dos corridas del cron decidan las dos que les toca mandar.
 */
export class DrizzleReminderLedger implements ReminderLedgerPort {
  constructor(private readonly db: LifecycleDatabase) {}

  async claim(claim: ReminderClaim): Promise<boolean> {
    const inserted = await this.db
      .insert(listingReminders)
      .values({
        id: randomUUID(),
        listingId: claim.listingId,
        kind: claim.kind,
        expiresAt: claim.expiresAt,
        sentAt: claim.sentAt,
      })
      .onConflictDoNothing()
      .returning({ id: listingReminders.id });

    return inserted.length > 0;
  }

  /**
   * Devuelve la reserva cuando el envío falló.
   *
   * Sí, es un `DELETE`, y es deliberado: sin él un proveedor de correo caído
   * cinco minutos deja ese ciclo mudo para siempre — y en el correo de purga
   * eso cuesta las fotos de alguien. Borra una fila que dice «se mandó» sobre
   * un correo que no se mandó, así que no destruye ningún dato real. Va en el
   * código de la aplicación y no en una migración, así que no toca el guardia
   * de `scripts/deploy-migrate.mjs`.
   */
  async release(claim: Omit<ReminderClaim, "sentAt">): Promise<void> {
    await this.db
      .delete(listingReminders)
      .where(
        and(
          eq(listingReminders.listingId, claim.listingId),
          eq(listingReminders.kind, claim.kind),
          eq(listingReminders.expiresAt, claim.expiresAt),
        ),
      );
  }
}

export class DrizzleJobRuns implements JobRunPort {
  constructor(private readonly db: LifecycleDatabase) {}

  async record(run: JobRunRecord): Promise<void> {
    await this.db.insert(jobRuns).values({ id: randomUUID(), ...run });
  }
}

/**
 * Las fotos a purgar y su borrado.
 *
 * **No hay ningún método que toque `listing`**, y eso es la garantía de 19c
 * escrita en la superficie: la clase no puede borrar un aviso ni cambiarle el
 * estado porque no tiene con qué.
 */
export class DrizzleListingPhotoPurge implements ListingPhotoPurgePort {
  constructor(private readonly db: LifecycleDatabase) {}

  async candidates(purgeBefore: Date): Promise<readonly PurgeCandidate[]> {
    const rows = await this.db
      .select({
        listingId: listings.id,
        photoId: listingPhotos.id,
        key: listingPhotoDerivatives.key,
      })
      .from(listings)
      .innerJoin(listingPhotos, eq(listingPhotos.listingId, listings.id))
      // `left` y no `inner`: una foto sin derivadas —subida a medias, o de una
      // corrida vieja— igual tiene que poder borrarse. Con `inner` quedaría
      // invisible para la purga y para siempre.
      .leftJoin(listingPhotoDerivatives, eq(listingPhotoDerivatives.photoId, listingPhotos.id))
      // **El mismo conjunto que `noticeCandidates`, y de la misma lista**
      // (19.16). La purga no puede alcanzar un estado al que no se le avisa:
      // la diferencia entre las dos consultas sería gente a la que se le borra
      // sin decirle nada, que es la distinción entera de la 19.8.
      .where(
        and(
          inArray(listings.status, [...ANNOUNCED_LIFECYCLE_STATUSES]),
          lt(listings.expiresAt, purgeBefore),
        ),
      );

    const byListing = new Map<string, { photoIds: Set<string>; objectKeys: Set<string> }>();
    for (const row of rows) {
      let entry = byListing.get(row.listingId);
      if (!entry) {
        entry = { photoIds: new Set(), objectKeys: new Set() };
        byListing.set(row.listingId, entry);
      }
      entry.photoIds.add(row.photoId);
      if (row.key) entry.objectKeys.add(row.key);
    }

    return [...byListing].map(([listingId, entry]) => ({
      listingId,
      photoIds: [...entry.photoIds],
      objectKeys: [...entry.objectKeys],
    }));
  }

  /**
   * Borra las filas de foto. Las derivadas y el hash se van solos por
   * `ON DELETE cascade`, que ya estaba en el esquema.
   *
   * Es el otro `DELETE` deliberado del módulo, y el que 19.5/19.6 obligan a
   * anunciar por dos canales antes de que llegue. La fila del aviso no se
   * toca: esta consulta no la nombra.
   */
  async deletePhotos(photoIds: readonly string[]): Promise<number> {
    if (photoIds.length === 0) return 0;

    const deleted = await this.db
      .delete(listingPhotos)
      .where(inArray(listingPhotos.id, [...photoIds]))
      .returning({ id: listingPhotos.id });

    return deleted.length;
  }
}
