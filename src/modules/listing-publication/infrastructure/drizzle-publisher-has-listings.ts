import { eq, sql } from "drizzle-orm";
import { listings } from "../../../shared/db/schema";
import type { PublisherHasListingsPort } from "../application/ports/publisher-has-listings.port";
import type { PublicationDatabase } from "./drizzle-listing-repository";

/**
 * tasks.md 14.56 — ¿esta cuenta tiene al menos un aviso? El dato que decide si
 * la barra dice «Mis avisos» o se queda en el círculo del perfil.
 *
 * **Semijunta, no conteo.** Sale `select 1 from "listing" where publisher_id =
 * $1 limit 1`: Postgres se detiene en la primera fila que encuentra. Es
 * exactamente el plan al que compila `EXISTS (select 1 …)` —un `Limit` sobre
 * el índice, sin nodo `Aggregate`— y por eso **no** se escribió con
 * `db.execute(sql\`select exists (…)\`)`: ese camino devuelve un envoltorio
 * distinto según el driver (el de Neon en producción, `pg` en la prueba de
 * integración), o sea justo la diferencia que la prueba no podría atrapar.
 * Anotado como desvío del texto de la tarea, con su razón (AGENTS.md §5).
 *
 * **Sin filtro por estado, a propósito.** Un borrador importado nace en
 * `draft` y sin fotos (9.15), y es la cuenta que MÁS necesita ver su enlace:
 * acaba de importar cincuenta avisos y todavía no se ve ninguno. La pregunta
 * es «¿publicaste algo?», no «¿se ve algo?».
 *
 * **Ningún campo de vuelta.** El `1` no se lee: lo único que sale de acá es si
 * hubo fila. Un `select` de columnas reales invitaría al primer llamador a
 * mirarlas y este puerto dejaría de contestar una sola pregunta.
 */
export class DrizzlePublisherHasListings implements PublisherHasListingsPort {
  constructor(private readonly db: PublicationDatabase) {}

  async hasAnyListing(publisherId: string): Promise<boolean> {
    const rows = await this.db
      .select({ presente: sql<number>`1` })
      .from(listings)
      .where(eq(listings.publisherId, publisherId))
      .limit(1);

    return rows.length > 0;
  }
}
