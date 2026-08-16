import type { PerceptualHash } from "../../domain/perceptual-hash";

/**
 * design.md D4 — the shape D4 prescribes verbatim; this codebase's
 * canonical example of "guarantees live in the narrowest API". Compare
 * identity/application/ports/phone-verification.port.ts: that port only
 * *discourages* an unsafe call, since a caller could write
 * `if (!status.enabled) throw` one line away. This port cannot: there is
 * no "findAllMatches" to call, and `excludePublisherId` is required on the
 * only query exposed, so a caller cannot merely forget the exemption.
 *
 * STATED AT ITS REAL STRENGTH: this holds only while `PhotoHashPort` has
 * exactly one method — a property of the interface's current shape, not
 * of the runtime. Nothing stops a future edit from adding an unsafe
 * second method. What it buys is narrower than "impossible": today's only
 * representable call already carries the exclusion, so weakening this
 * requires a deliberate, reviewable interface change, not a silent slip.
 *
 * `maxDistance` is caller-supplied, not hard-coded to `8`, so the
 * calibration harness and the eventual PublishListingUseCase share one
 * query shape while the threshold (Open Questions — uncalibrated) is tuned.
 */
export type PublisherId = string;

export interface PhotoHashMatch {
  photoId: string;
  listingId: string;
  publisherId: PublisherId;
  distance: number;
}

export interface PhotoHashPort {
  findMatchesFromOtherPublishers(
    hash: PerceptualHash,
    excludePublisherId: PublisherId,
    maxDistance: number,
  ): Promise<PhotoHashMatch[]>;
}
