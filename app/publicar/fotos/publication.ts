import { nextAuthSessionPort } from "@/modules/identity/infrastructure/session-port";
import type { PublishListingDependencies } from "@/modules/listing-publication/application/publish-listing";
import {
  DrizzleListingRepository,
  DrizzleZoneCatalogue,
} from "@/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { deriveListingPhoto } from "@/modules/listing-publication/infrastructure/photo-derivatives";
import { createR2PhotoStorage } from "@/modules/listing-publication/infrastructure/r2-photo-storage";
import { db } from "@/shared/db/client";
import { getTransactionalDatabase } from "@/shared/db/transactional-client";

/**
 * The composition root for publishing — the one place that knows which
 * concrete adapter serves each port.
 *
 * Everything above this file has been written against interfaces and proven
 * without a bucket, a credential or a database. This is where that choice is
 * paid for in one function, and it is worth reading as a list because each
 * line is a decision made earlier:
 *
 * - **Reads use `db` (`neon-http`), writes use the transactional client.**
 *   `neon-http` cannot do transactions at all, and a listing plus its photo
 *   rows must succeed or fail together. Reads stay on HTTP because D2's
 *   latency argument is about the read path.
 * - **Derivation is adapted, not injected raw.** The port takes `Uint8Array`
 *   so the application layer never mentions `Buffer`, which is Node's and not
 *   the domain's.
 *
 * Built per request rather than at module load. `createR2PhotoStorage` reads
 * six environment variables and throws on any that is missing — at module
 * scope that would take down every route that merely imports this file,
 * including ones that never publish anything.
 */
export function publishListingDependencies(): PublishListingDependencies {
  const storage = createR2PhotoStorage();

  return {
    sessionPort: nextAuthSessionPort,
    zones: new DrizzleZoneCatalogue(db),
    listings: new DrizzleListingRepository(getTransactionalDatabase()),
    storage,
    derive: (source) => deriveListingPhoto(Buffer.from(source)),
  };
}
