import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { listings, users, verifiedContacts } from "../../../shared/db/schema";
import type {
  ContactVerificationEvidencePort,
  ContactVerificationQuery,
  ListingContactVerificationPort,
  NewVerifiedContact,
  VerifiedContactPort,
} from "../application/ports/verified-contact.port";
import type { ContactVerificationEvidence } from "../domain/contact-verification";

/** Misma forma que el resto de los adaptadores: producción pasa el cliente de
 * Neon, las pruebas de integración pasan un pool de `node-postgres` contra un
 * contenedor descartable, y las dos corren este mismo código. */
export type VerifiedContactDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * La lectura de la 19.9, en UNA consulta.
 *
 * **Un `LEFT JOIN` y no dos viajes**, porque las tres cosas que la decisión
 * necesita —la fila viva del triple, el correo de la cuenta y el instante que
 * Auth.js dejó— se responden juntas, y quien va a preguntarlo en cada visita
 * es el dibujo de la ficha (16.12, 16.34, 15.11).
 *
 * **Es `LEFT` y no `INNER` a propósito**: sin fila de verificación tiene que
 * volver igual la cuenta, porque «existe la cuenta y no tiene nada
 * verificado» y «no existe la cuenta» son respuestas distintas y sólo la
 * segunda es `null`.
 *
 * **Los doce meses de la 19.11 NO entran acá.** Este comentario decía que sí,
 * dentro de la condición del join; la razón por la que no, y dónde viven, está
 * escrita en el puerto que esta clase implementa. En una frase: esta consulta
 * la comparten publicar y la ficha, y la ficha tiene que seguir viendo la fila
 * vieja (19.12).
 */
export class DrizzleContactVerificationEvidence implements ContactVerificationEvidencePort {
  constructor(private readonly db: VerifiedContactDatabase) {}

  async findEvidence(query: ContactVerificationQuery): Promise<ContactVerificationEvidence | null> {
    const rows = await this.db
      .select({
        verifiedAt: verifiedContacts.verifiedAt,
        accountEmail: users.email,
        accountEmailVerifiedAt: users.emailVerified,
      })
      .from(users)
      .leftJoin(
        verifiedContacts,
        and(
          eq(verifiedContacts.userId, users.id),
          eq(verifiedContacts.method, query.contact.method),
          eq(verifiedContacts.value, query.contact.value),
        ),
      )
      .where(eq(users.id, query.userId))
      .limit(1);

    return rows[0] ?? null;
  }
}

/**
 * (tasks.md 22.32) El lado del estado bloqueado, en UNA consulta que nunca
 * trae `contact_method` ni `contact_value` de vuelta a JavaScript.
 *
 * **`INNER JOIN` y no `LEFT`, a propósito.** Sin fila viva de `verified_
 * contact` no hay nada que contestar, y un `INNER` lo resuelve solo: cero
 * filas es exactamente `null` (AGENTS.md §7), sin una rama que lo declare.
 *
 * **El `select` sólo nombra `verifiedAt`.** Es la garantía completa y no una
 * promesa de comentario: el tipo de retorno es `Date | null`, así que no hay
 * forma de que el valor del contacto cruce el límite del proceso de render
 * desde este método — ni un `unknown` que alguien tenga que recordar no leer.
 */
export class DrizzleListingContactVerification implements ListingContactVerificationPort {
  constructor(private readonly db: VerifiedContactDatabase) {}

  async findVerifiedAt(listingId: string): Promise<Date | null> {
    const rows = await this.db
      .select({ verifiedAt: verifiedContacts.verifiedAt })
      .from(listings)
      .innerJoin(
        verifiedContacts,
        and(
          eq(verifiedContacts.userId, listings.publisherId),
          eq(verifiedContacts.method, listings.contactMethod),
          eq(verifiedContacts.value, listings.contactValue),
        ),
      )
      .where(eq(listings.id, listingId))
      .limit(1);

    return rows[0]?.verifiedAt ?? null;
  }
}

/**
 * La escritura, y es un upsert sobre la clave natural.
 *
 * **Acá es donde la 19.13 deja de ser trabajo de nadie.** Cincuenta avisos de
 * una inmobiliaria con el mismo contacto chocan contra la primaria y el
 * `DO UPDATE` los absorbe: no hay consulta previa que alguien pueda olvidar,
 * ni una fila por aviso. Misma disciplina que
 * `listing_publisher_external_reference_unique`, donde la garantía es la
 * restricción y nunca un `if`.
 */
export class DrizzleVerifiedContacts implements VerifiedContactPort {
  constructor(private readonly db: VerifiedContactDatabase) {}

  async record(verified: NewVerifiedContact): Promise<void> {
    await this.db
      .insert(verifiedContacts)
      .values({
        userId: verified.userId,
        method: verified.contact.method,
        value: verified.contact.value,
        verifiedAt: verified.verifiedAt,
      })
      .onConflictDoUpdate({
        target: [verifiedContacts.userId, verifiedContacts.method, verifiedContacts.value],
        set: { verifiedAt: verified.verifiedAt },
      });
  }
}
