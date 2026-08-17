import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { assertPooledConnectionString } from "./pooled-connection";
import * as schema from "./schema";

/**
 * A second Neon client, for writes that must be atomic.
 *
 * `client.ts` uses `neon-http`, and its own comment already named this file's
 * trigger: "Interactive multi-statement transactions are not needed by
 * anything this app does today ... if that changes, `drizzle-orm/neon-serverless`
 * is the documented escalation path." Publishing a listing changed that. It
 * writes one `listing` row and up to six `listing_photo` rows, and a listing
 * with no photos violates a publish rule — so the two writes must succeed or
 * fail together.
 *
 * **`neon-http` cannot do it.** `db.transaction()` there throws "No
 * transactions support in neon-http driver". It does offer `batch()`, which
 * Neon runs as one transaction — but `batch()` exists on no other driver, so
 * the integration test could not run the same code the deployment runs. A
 * test that exercises a different path than production is worse than no test:
 * it reports on code nobody ships.
 *
 * **Reads deliberately stay on `neon-http`.** D2's latency argument is about
 * the read path — search and listing detail, on Venezuelan connections — and
 * HTTP with no connection setup wins there. This client is only for the
 * publish write, which is a rare, human-initiated action where a WebSocket
 * handshake is invisible. Two clients chosen by access pattern, not one
 * client compromised for both.
 *
 * No `ws` dependency: `@neondatabase/serverless` uses the global `WebSocket`
 * when the runtime has one, which Node 22+ and Vercel's Node runtime do.
 */

export type TransactionalDatabase = NeonDatabase<typeof schema>;

let pool: Pool | undefined;

/**
 * Created on first use rather than at module load. `client.ts` resolves its
 * connection string at module scope, and that is what made merely importing
 * the seed script throw — the defect that cost a CI run and a founder's
 * `pnpm db:seed`. A module nobody has called should not be able to fail.
 */
export function getTransactionalDatabase(): TransactionalDatabase {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL environment variable is not set.");
    pool = new Pool({ connectionString: assertPooledConnectionString(url) });
  }

  return drizzle(pool, { schema });
}
