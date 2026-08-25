import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { users } from "../../../shared/db/schema";
import type { ImportAccountContactPort } from "../application/ports/import-account-contact.port";
import type { AccountDefaultContact } from "../domain/import-account-contact";

/**
 * Same handle-by-constructor shape as `DrizzleBulkImportAccounts`: production
 * passes the Neon client, integration tests pass a `node-postgres` pool
 * pointed at a disposable container, and both run this exact code.
 */
export type ImportAccountContactDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export class DrizzleImportAccountContact implements ImportAccountContactPort {
  constructor(private readonly db: ImportAccountContactDatabase) {}

  async findAccountContact(userId: string): Promise<AccountDefaultContact | null> {
    const rows = await this.db
      .select({ contactMethod: users.contactMethod, contactValue: users.contactValue })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }
}
