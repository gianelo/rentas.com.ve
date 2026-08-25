import type { SessionPort } from "../../identity/application/ports/session.port";
import { requireAuthenticatedSession } from "../../identity/application/require-authenticated-session";
import { MAX_PHOTOS_PER_LISTING } from "../domain/publishable-listing";
import type { ListingActivationPort } from "./ports/listing-activation.port";
import type { ListingPhotoAttachmentPort } from "./ports/listing-photo-attachment.port";
import type { PhotoDerivationPort } from "./ports/photo-derivation.port";
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
 * **Known gap, recorded rather than hidden (AGENTS.md §5).** The
 * broker-bulk-import spec's own scenario "Duplicate photo rules still apply
 * to imported drafts" names the SAME cross-account perceptual-hash rule the
 * single-listing flow is supposed to apply (design.md D4, `PhotoHashPort`).
 * That rule is NOT wired into ANY listing flow in this codebase today —
 * task 4.7 ("E2E: publish → duplicate photo rejected cross-account...
 * needs PR3") is still open, and grep across `src/` turns up zero callers
 * of `PhotoHashPort.findMatchesFromOtherPublishers` and zero writers of
 * `listing_photo_hash` outside its own adapter test. Wiring it here alone
 * would check newly-attached photos against a table nothing has ever
 * written to — a check with no way to ever find a match, which is not a
 * guard, it is the appearance of one. Doing this honestly needs `4.7`'s own
 * scope: a `PhotoHashPort` write method, hash computation wired into the
 * ONE shared choke point both `publishListing` and this file already call
 * (`processUploadedPhoto`), and its own dedicated tests — genuinely
 * separate work from tasks.md 9.20-9.23, left for that task rather than
 * built partially and silently here.
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
  const { sessionPort, listings, photos, storage, derive } = dependencies;
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
  // the INCOMING key, byte-level inspection, derivative generation,
  // promotion to a permanent key. `session.userId` (never the request) is
  // what makes this second, key-level ownership check mean anything.
  const processed = await processUploadedPhoto(
    {
      publisherId: session.userId,
      incomingKey: request.incomingKey,
      declaredContentType: request.declaredContentType,
    },
    { storage, derive },
  );

  const position = draft.photoCount;
  await photos.attachPhoto(draft.id, { position, derivatives: processed.derivatives }, now());

  return { listingId: draft.id, position };
}
