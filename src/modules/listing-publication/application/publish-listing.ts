import type { SessionPort } from "../../identity/application/ports/session.port";
import { requireAuthenticatedSession } from "../../identity/application/require-authenticated-session";
import type { PhotoHashPort } from "../../listing-trust/application/ports/photo-hash.port";
import type { PerceptualHash } from "../../listing-trust/domain/perceptual-hash";
import {
  type DraftListing,
  type PublishViolation,
  validatePublishableListing,
} from "../domain/publishable-listing";
import type { ListingRepositoryPort, NewListingPhoto } from "./ports/listing-repository.port";
import type { PhotoDerivationPort } from "./ports/photo-derivation.port";
import type { PhotoHashComputationPort } from "./ports/photo-hash-computation.port";
import type { PhotoStoragePort } from "./ports/photo-storage.port";
import type { ZoneCataloguePort } from "./ports/zone-catalogue.port";
import { processUploadedPhoto } from "./process-uploaded-photo";

/**
 * Task 3.5 — publishing a listing, end to end.
 *
 * This is the only place the four pieces meet: the session gate, the publish
 * rules, the photo pipeline and the write. Each is proven on its own
 * elsewhere; what is decided HERE is the order they run in, and that order is
 * the substance of this file rather than plumbing around it.
 */

/** SISTEMA.md screen 3: "Tu aviso queda activo 30 días." */
export const LISTING_ACTIVE_DAYS = 30;

export class PublishRejectedError extends Error {
  readonly violations: readonly PublishViolation[];

  constructor(violations: readonly PublishViolation[]) {
    super(`publish-listing: rejected (${violations.join(", ")})`);
    this.name = "PublishRejectedError";
    this.violations = violations;
  }
}

export interface SubmittedPhoto {
  /** The key `createUploadTarget` issued. Ownership is re-checked downstream. */
  readonly incomingKey: string;
  readonly declaredContentType: string;
}

/**
 * `photoCount` is absent by construction. It is derived from `photos` below,
 * and a request able to state it separately is a request able to disagree
 * with itself — the form would then be trusted about how many photos it sent.
 */
export type PublishListingRequest = Omit<DraftListing, "photoCount"> & {
  readonly photos: readonly SubmittedPhoto[];
};

export interface PublishListingDependencies {
  readonly sessionPort: SessionPort;
  readonly zones: ZoneCataloguePort;
  readonly listings: ListingRepositoryPort;
  readonly storage: PhotoStoragePort;
  readonly derive: PhotoDerivationPort;
  readonly computeHash: PhotoHashComputationPort;
  /**
   * Full `PhotoHashPort`, not narrowed: this function both checks (via
   * `processUploadedPhoto`, before the listing exists) and records (after
   * `listings.save` returns) — see the ordering note above `listings.save`.
   */
  readonly photoHashes: PhotoHashPort;
  readonly now?: () => Date;
}

/**
 * The backstop for the defect this project already shipped once: `rooms` and
 * `area_m2` were NOT NULL in the schema, declared on the draft, and checked
 * by nothing — so a missing value passed validation and died at the INSERT.
 *
 * Reading through this instead of casting means that if the validator ever
 * stops covering a field, the publish fails here, loudly, naming the field —
 * rather than writing a NULL into a column that refuses it.
 *
 * Exported only so it can be proven directly. Every path through
 * `publishListing` is now supposed to make its throw unreachable, which is
 * exactly why it cannot be reached from a test through the use case — and an
 * untested backstop is not a backstop.
 */
export function present<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(
      `publish-listing: ${field} passed validation but is undefined — ` +
        "validatePublishableListing no longer covers every persisted column",
    );
  }
  return value;
}

export async function publishListing(
  request: PublishListingRequest,
  dependencies: PublishListingDependencies,
): Promise<{ readonly listingId: string }> {
  const { sessionPort, zones, listings, storage, derive, computeHash, photoHashes } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  // First, and before any read: an unauthenticated caller must not be able to
  // make this function do work, let alone touch storage.
  const session = await requireAuthenticatedSession(sessionPort);

  const curatedZones = request.cityId ? await zones.listZonesForCity(request.cityId) : [];

  const violations = validatePublishableListing(
    { ...request, photoCount: request.photos.length },
    curatedZones,
    "activation",
  );

  // Before the photos, always. Validation is a pure function over values
  // already in memory; each photo costs a network read and a `sharp` decode.
  // Spending that on a draft that was never publishable burns a serverless
  // invocation to reach an answer already known.
  if (violations.length > 0) {
    throw new PublishRejectedError(violations);
  }

  const photos: NewListingPhoto[] = [];
  // Parallel to `photos` — the perceptual hash `processUploadedPhoto` (D4,
  // task 4.7) computed for that SAME index. Kept out of `NewListingPhoto`
  // on purpose: that type is exactly what `ListingRepositoryPort.save`
  // persists, and a hash cannot be recorded until AFTER `save` returns the
  // real photo id it was assigned — see the note above `listings.save`
  // below.
  const hashes: PerceptualHash[] = [];
  for (const [position, submitted] of request.photos.entries()) {
    // Sequential, and that is a decision rather than an oversight. Six
    // concurrent decodes against a serverless function's fixed memory ceiling
    // is how this route dies under load — and it would die on the largest
    // uploads, which are the ones a publisher cares most about.
    //
    // `session.userId` is what makes the ownership check downstream mean
    // anything: it comes from the session cookie, never from the request.
    // It is ALSO the same-publisher exemption's `excludePublisherId` (D4):
    // an owner republishing their own expired listing's photos is exempt
    // because this is the id `processUploadedPhoto` excludes, never a
    // hard-coded or request-supplied one.
    const processed = await processUploadedPhoto(
      { publisherId: session.userId, ...submitted },
      { storage, derive, computeHash, photoHashes },
    );

    photos.push({ position, derivatives: processed.derivatives });
    hashes.push(processed.hash);
  }

  const publishedAt = now();

  // design.md D4, task 4.7 — `photoIds` comes back only from THIS call, in
  // submission order: `listing_photo_hash.photo_id` is a primary key
  // referencing `listing_photo.id`, so a hash cannot be recorded before
  // its photo row exists, and this is the first moment it does.
  const { id, photoIds } = await listings.save({
    publisherId: session.userId,
    publisherType: present(request.publisherType, "publisherType"),
    propertyType: present(request.propertyType, "propertyType"),
    cityId: present(request.cityId, "cityId"),
    zoneId: present(request.zoneId, "zoneId"),
    title: present(request.title, "title"),
    description: present(request.description, "description"),
    priceUsd: present(request.priceUsd, "priceUsd"),
    rooms: present(request.rooms, "rooms"),
    areaM2: present(request.areaM2, "areaM2"),
    bathrooms: present(request.bathrooms, "bathrooms"),
    // The ONE field read through `??` rather than `present`, and the reason
    // is that its absence is answerable and every other field's is not. Zero
    // parking is a fact the domain deliberately does not require anyone to
    // state, so a draft that omits it is complete rather than broken.
    parkingSpots: request.parkingSpots ?? 0,
    // Los cinco atributos siguen la misma regla que `parkingSpots` y por otra
    // razón: no es que su ausencia sea respondible, es que `false` ES la
    // respuesta. "No lo declaró" y "no lo tiene" son la misma fila en la base
    // y dos frases distintas en la pantalla, y esa distinción vive en la ficha
    // (F25), que nunca afirma una ausencia.
    hasPowerPlant: request.hasPowerPlant ?? false,
    hasRegularWater: request.hasRegularWater ?? false,
    isFurnished: request.isFurnished ?? false,
    hasSecurity: request.hasSecurity ?? false,
    hasAppliances: request.hasAppliances ?? false,
    contactMethod: present(request.contactMethod, "contactMethod"),
    contactValue: present(request.contactValue, "contactValue"),
    status: "active",
    publishedAt,
    expiresAt: new Date(publishedAt.getTime() + LISTING_ACTIVE_DAYS * 86_400_000),
    photos,
  });

  // Recorded now, and only now — never before `save` above resolved. A
  // hash written for a photo whose listing was then rejected for an
  // unrelated reason would poison the table against this same publisher
  // (see `PhotoHashPort.record`'s own doc). Parallel writes, same
  // reasoning `processUploadedPhoto` already uses for its five derivative
  // uploads: these are independent rows, and running them one at a time
  // would only multiply latency for no safety gained.
  await Promise.all(
    photoIds.map((photoId, index) =>
      photoHashes.record({
        photoId,
        hash: hashes[index] as PerceptualHash,
        recordedAt: publishedAt,
      }),
    ),
  );

  return { listingId: id };
}
