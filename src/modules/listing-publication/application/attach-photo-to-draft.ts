import type { SessionPort } from "../../identity/application/ports/session.port";
import { requireAuthenticatedSession } from "../../identity/application/require-authenticated-session";
import type { PhotoHashPort } from "../../listing-trust/application/ports/photo-hash.port";
import { MAX_PHOTOS_PER_LISTING } from "../domain/publishable-listing";
import type { ListingActivationPort } from "./ports/listing-activation.port";
import type { ListingPhotoAttachmentPort } from "./ports/listing-photo-attachment.port";
import type { PhotoDerivationPort } from "./ports/photo-derivation.port";
import type { PhotoHashComputationPort } from "./ports/photo-hash-computation.port";
import type { PhotoStoragePort } from "./ports/photo-storage.port";
import { processUploadedPhoto } from "./process-uploaded-photo";

/**
 * broker-bulk-import spec, "Photos Attached Through the Existing Upload
 * Path" (tasks.md 9.20/9.21) — the step nothing in this codebase built
 * until now: an imported draft is created with zero photos (tasks.md 9.15),
 * and until this file existed there was no way to put one on it.
 *
 * **Reuses, does not restate.** `createUploadTarget` (task 3.7,
 * `PhotoStoragePort`) already issues a correct presigned PUT into the
 * publisher's own prefix — nothing here needs a second upload endpoint.
 * `processUploadedPhoto` (task 3.7) already owns the byte-level guard,
 * derivative generation and promotion, and is called VERBATIM below, the
 * same way `publishListing` calls it — its own docstring already
 * anticipated this: "a separate step... because the broker importer
 * (Phase 9) uploads photos in a second phase with no publish form anywhere
 * near it."
 *
 * **Scoped to a draft, and that is a decision, not an oversight.** This
 * path accepts photos ONLY for a listing `ListingActivationPort.findDraftById`
 * returns — which is itself scoped to `status = 'draft'` in its own `WHERE`.
 * An `active` listing cannot reach this function at all: nothing in this
 * phase, this spec, or any task before 9.24 asks for editing the photo set
 * of a listing that is already live, and doing so would require deciding
 * semantics (reordering, replacing, re-checking the ceiling against a row
 * already searchable) that no scenario here names. Widening this later is a
 * deliberate, reviewable change to `findDraftById`'s own `WHERE`, not a gap
 * this file leaves open by accident.
 *
 * **Ownership BEFORE the ceiling check and BEFORE any storage read**, same
 * order `activateListing` uses for the same reason: a stranger's draft must
 * not leak how many photos it already holds, let alone accept one.
 *
 * **Fail closed.** A draft that cannot be found, or whose owner cannot be
 * established, is refused outright — never defaulted to the caller's own
 * session, and never silently treated as "not a draft, so nothing to
 * protect".
 *
 * **The gap this docstring used to name is closed (task 4.7).** The
 * broker-bulk-import spec's own scenario "Duplicate photo rules still apply
 * to imported drafts" names the SAME cross-account perceptual-hash rule the
 * single-listing flow applies (design.md D4, `PhotoHashPort`). It reaches
 * this path exactly the way it reaches `publishListing`: through the ONE
 * shared choke point both already call, `processUploadedPhoto`, which now
 * both computes the hash and checks it BEFORE this function's own write.
 * Recording it is this file's own job, not `processUploadedPhoto`'s —
 * `listing_photo_hash.photo_id` references `listing_photo.id`, so the hash
 * cannot be written until `photos.attachPhoto` below returns the id it
 * assigned. `PhotoHashPort.record`'s own doc restates this ordering.
 */

export class AttachPhotoToDraftNotFoundError extends Error {
  constructor(listingId: string) {
    super(`attach-photo-to-draft: draft ${listingId} was not found.`);
    this.name = "AttachPhotoToDraftNotFoundError";
  }
}

/**
 * Same shape as `ActivateListingNotOwnedError` and
 * `process-uploaded-photo.ts`'s `key.notOwnedByPublisher`: an explicit
 * rejection, never a silent 404 that would leave a stranger unable to tell
 * "this draft does not exist" from "this draft is not yours".
 */
export class AttachPhotoToDraftNotOwnedError extends Error {
  constructor(listingId: string) {
    super(`attach-photo-to-draft: draft ${listingId} does not belong to the caller.`);
    this.name = "AttachPhotoToDraftNotOwnedError";
  }
}

export class AttachPhotoToDraftLimitReachedError extends Error {
  constructor(listingId: string) {
    super(
      `attach-photo-to-draft: draft ${listingId} already holds ${MAX_PHOTOS_PER_LISTING} ` +
        "photos, the maximum a listing may carry.",
    );
    this.name = "AttachPhotoToDraftLimitReachedError";
  }
}

export interface AttachPhotoToDraftRequest {
  readonly listingId: string;
  /** The key `createUploadTarget` issued. Ownership is re-checked downstream. */
  readonly incomingKey: string;
  /** What the browser claimed. Checked against the header, never trusted. */
  readonly declaredContentType: string;
}

export interface AttachPhotoToDraftDependencies {
  readonly sessionPort: SessionPort;
  readonly listings: ListingActivationPort;
  readonly photos: ListingPhotoAttachmentPort;
  readonly storage: PhotoStoragePort;
  readonly derive: PhotoDerivationPort;
  readonly computeHash: PhotoHashComputationPort;
  /**
   * Full `PhotoHashPort`, not narrowed: this function both checks (via
   * `processUploadedPhoto`, before the photo row exists) and records
   * (after `photos.attachPhoto` returns) — same reasoning
   * `PublishListingDependencies.photoHashes` documents.
   */
  readonly photoHashes: PhotoHashPort;
  readonly now?: () => Date;
}

export interface AttachPhotoToDraftResult {
  readonly listingId: string;
  /** Zero-based display order this photo was written at. */
  readonly position: number;
}

export async function attachPhotoToDraft(
  request: AttachPhotoToDraftRequest,
  dependencies: AttachPhotoToDraftDependencies,
): Promise<AttachPhotoToDraftResult> {
  const { sessionPort, listings, photos, storage, derive, computeHash, photoHashes } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  // First, and before any read: an unauthenticated caller must not be able
  // to make this function do work, let alone touch storage — same order
  // publishListing, activateListing and reportListing all use.
  const session = await requireAuthenticatedSession(sessionPort);

  const draft = await listings.findDraftById(request.listingId);
  if (!draft) {
    throw new AttachPhotoToDraftNotFoundError(request.listingId);
  }

  // Ownership BEFORE the ceiling check and BEFORE any storage read or
  // write. A stranger's draft must not leak how many photos it already
  // holds, let alone accept one from someone who does not own it.
  if (draft.publisherId !== session.userId) {
    throw new AttachPhotoToDraftNotOwnedError(request.listingId);
  }

  if (draft.photoCount >= MAX_PHOTOS_PER_LISTING) {
    throw new AttachPhotoToDraftLimitReachedError(request.listingId);
  }

  // The SAME pipeline the single-listing publish flow uses: ownership of
  // the INCOMING key, byte-level inspection, the D4 perceptual-hash
  // duplicate check, derivative generation, promotion to a permanent key.
  // `session.userId` (never the request) is what makes the ownership check
  // mean anything, and it is ALSO the same-publisher exemption's
  // `excludePublisherId` (design.md D4) — an owner reusing a photo from
  // one of their own listings, active or expired, is exempt because this
  // is the id excluded, never a hard-coded or request-supplied one.
  const processed = await processUploadedPhoto(
    {
      publisherId: session.userId,
      incomingKey: request.incomingKey,
      declaredContentType: request.declaredContentType,
    },
    { storage, derive, computeHash, photoHashes },
  );

  const position = draft.photoCount;
  const attachedAt = now();
  const { photoId } = await photos.attachPhoto(
    draft.id,
    { position, derivatives: processed.derivatives },
    attachedAt,
  );

  // Recorded now, and only now — never before `attachPhoto` above resolved.
  // `listing_photo_hash.photo_id` references `listing_photo.id`, so the
  // hash cannot be written until the row it names exists, and a hash
  // recorded before that row existed would risk poisoning the table
  // against this same publisher if the attach had failed for an unrelated
  // reason (`PhotoHashPort.record`'s own doc).
  await photoHashes.record({ photoId, hash: processed.hash, recordedAt: attachedAt });

  return { listingId: draft.id, position };
}
