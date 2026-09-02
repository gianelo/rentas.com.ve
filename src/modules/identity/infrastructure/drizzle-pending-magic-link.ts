import { createHash } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { verificationTokens } from "../../../shared/db/schema";
import type {
  PendingMagicLinkPort,
  PendingMagicLinkQuery,
} from "../application/ports/pending-magic-link.port";

/** Misma forma que el resto de los adaptadores: producción pasa el cliente de
 * Neon, las pruebas de integración pasan un pool de `node-postgres` contra un
 * contenedor descartable, y las dos corren este mismo código. */
export type PendingMagicLinkDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * **La huella de un enlace**: sha256 del token, en hexadecimal.
 *
 * **Se calcula acá y no en el dominio**, y no es una comodidad: éste es el
 * único punto del proceso donde el token en claro existe fuera de Auth.js, y
 * el trato es que no salga de esta función. Un dominio que hashee obliga a que
 * alguien le pase el token, y ahí ya salió.
 */
export function fingerprintOfMagicLink(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Los enlaces vivos de un buzón (tasks.md 15.14).
 *
 * **`expires > now` en SQL y no en memoria**: la fila vencida no la borra
 * nadie hasta que alguien la usa, así que un filtro de aplicación tendría que
 * acordarse — y el día que se olvide, el sondeo diría «todavía esperando»
 * sobre un enlace que ya no sirve.
 */
export class DrizzlePendingMagicLinks implements PendingMagicLinkPort {
  constructor(private readonly db: PendingMagicLinkDatabase) {}

  async findPendingFingerprints(query: PendingMagicLinkQuery): Promise<readonly string[]> {
    const rows = await this.db
      .select({ token: verificationTokens.token })
      .from(verificationTokens)
      .where(
        and(
          // El identificador entra por la clave primaria `(identifier, token)`,
          // cuyo prefijo es justo esta columna: sin índice nuevo.
          eq(verificationTokens.identifier, query.identifier),
          gt(verificationTokens.expires, query.now),
        ),
      )
      .orderBy(desc(verificationTokens.expires));

    return rows.map((row) => fingerprintOfMagicLink(row.token));
  }
}
