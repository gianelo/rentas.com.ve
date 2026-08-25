import type { PerceptualHash } from "../../domain/perceptual-hash";

/**
 * design.md D4 — the shape D4 prescribes verbatim; this codebase's
 * canonical example of "guarantees live in the narrowest API". Compare
 * identity/application/ports/phone-verification.port.ts: that port only
 * *discourages* an unsafe call, since a caller could write
 * `if (!status.enabled) throw` one line away. `findMatchesFromOtherPublishers`
 * cannot: there is no "findAllMatches" to call, and `excludePublisherId` is
 * required on the only matching query exposed, so a caller cannot merely
 * forget the exemption.
 *
 * STATED AT ITS REAL STRENGTH, AND UPDATED HONESTLY (task 4.7): the port
 * used to have exactly one method, and its own comment already predicted
 * this — "nothing stops a future edit from adding an unsafe second method".
 * `record` below is that second method, added because nothing in this
 * codebase could write a `listing_photo_hash` row until task 4.7 wired it
 * in. It does not weaken the guarantee above: `record` carries no
 * `excludePublisherId` to forget, because it is not a matching query — it
 * writes exactly the columns the schema has (`photoId`, `hash`,
 * `recordedAt`), with no `publisherId` to leak, exactly as
 * `listing_photo_hash` itself has none (schema.ts).
 *
 * `maxDistance` is caller-supplied, not hard-coded to `8`, so the
 * calibration harness and the publish/attach paths share one query shape
 * while the threshold (Open Questions — uncalibrated) is tuned.
 */
export type PublisherId = string;

export interface PhotoHashMatch {
  photoId: string;
  listingId: string;
  publisherId: PublisherId;
  distance: number;
}

export interface NewPhotoHash {
  readonly photoId: string;
  readonly hash: PerceptualHash;
  /**
   * Caller-supplied rather than defaulted inside the adapter — the same
   * reasoning `DrizzleListingRepository.save` and `ListingPhotoAttachmentPort`
   * already follow: the clock belongs to the use case that decided the
   * moment, not to the row a port writes.
   */
  readonly recordedAt: Date;
}

export interface PhotoHashPort {
  findMatchesFromOtherPublishers(
    hash: PerceptualHash,
    excludePublisherId: PublisherId,
    maxDistance: number,
  ): Promise<PhotoHashMatch[]>;

  /**
   * Task 4.7 — the write side. Callers record ONLY after their own
   * `listing_photo` row exists: `listing_photo_hash.photo_id` is a primary
   * key referencing `listing_photo.id` (`ON DELETE cascade`), so a hash
   * cannot be written before its photo row does, and recording earlier
   * would risk poisoning the table against the photo's own publisher if
   * the surrounding submission were then rejected for an unrelated reason.
   */
  record(newHash: NewPhotoHash): Promise<void>;
}
