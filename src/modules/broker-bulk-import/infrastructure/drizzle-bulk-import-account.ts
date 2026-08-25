import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { users } from "../../../shared/db/schema";
import type {
  BulkImportAccount,
  BulkImportAccountPort,
} from "../application/ports/bulk-import-account.port";

/**
 * The one column `authorizeBulkImport` needs, read where it lives (tasks.md
 * 9.1/9.3). Same handle-by-constructor shape as every other infrastructure
 * adapter in this codebase (`DrizzlePhotoHash`, `DrizzleListingModeration`):
 * production passes the Neon client, integration tests pass a
 * `node-postgres` pool pointed at a disposable container, and both run this
 * exact code.
 */
export type BulkImportAccountDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export class DrizzleBulkImportAccounts implements BulkImportAccountPort {
  constructor(private readonly db: BulkImportAccountDatabase) {}

  async findAccount(userId: string): Promise<BulkImportAccount | null> {
    const rows = await this.db
      .select({ bulkImportEnabled: users.bulkImportEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }
}
