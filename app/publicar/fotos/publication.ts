import {
  DrizzleContactVerificationEvidence,
  DrizzleVerifiedContacts,
} from "@/modules/identity/infrastructure/drizzle-verified-contact";
import { nextAuthSessionPort } from "@/modules/identity/infrastructure/session-port";
import type { PublishListingDependencies } from "@/modules/listing-publication/application/publish-listing";
import {
  DrizzleListingRepository,
  DrizzleZoneCatalogue,
} from "@/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { deriveListingPhoto } from "@/modules/listing-publication/infrastructure/photo-derivatives";
import { createR2PhotoStorage } from "@/modules/listing-publication/infrastructure/r2-photo-storage";
import { DrizzlePhotoHash } from "@/modules/listing-trust/infrastructure/drizzle-photo-hash";
import { computeDHash } from "@/modules/listing-trust/infrastructure/sharp-dhash";
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
 * - **Derivation and hash computation are both adapted, not injected raw.**
 *   Both ports take `Uint8Array` so the application layer never mentions
 *   `Buffer`, which is Node's and not the domain's.
 * - **La verificación del contacto lee por `db` y escribe por el cliente
 *   transaccional** (tasks.md 19.9/19.10), por la misma razón de la primera
 *   línea de esta lista y no por una nueva: la lectura es del camino de
 *   lectura, y `neon-http` no sirve para la mitad que escribe.
 * - **`photoHashes` uses the transactional client, not `db`.** It both reads
 *   (`findMatchesFromOtherPublishers`, inside the upload guard) and writes
 *   (`record`, task 4.7) — `neon-http` cannot do the write half at all, the
 *   same reason `listings` below is not built on `db` either.
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
    computeHash: (source) => computeDHash(Buffer.from(source)),
    photoHashes: new DrizzlePhotoHash(getTransactionalDatabase()),
    contactEvidence: new DrizzleContactVerificationEvidence(db),
    verifiedContacts: new DrizzleVerifiedContacts(getTransactionalDatabase()),
  };
}
