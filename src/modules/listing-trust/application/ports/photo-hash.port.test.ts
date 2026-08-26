import { describe, expect, it } from "vitest";
import { computeDHashFromGrayscalePixels } from "../../domain/dhash";
import { InMemoryPhotoHashFake } from "./in-memory-photo-hash.fake";

const MAX_DISTANCE = 8; // design.md D4's proposed, uncalibrated threshold

function solidGray(value: number): number[] {
  return Array(72).fill(value);
}

function ascendingGradient(): number[] {
  return Array(8).fill([0, 20, 40, 60, 80, 100, 120, 140, 160]).flat();
}

/**
 * listing-trust spec, "Cross-Account Duplicate Photo Rejection" and
 * "Same-Publisher Photo Reuse Exemption".
 *
 * WHAT THIS PROVES: the PhotoHashPort CONTRACT against InMemoryPhotoHashFake
 * — the real Drizzle/`bit_count` adapter is task 4.6, a later slice
 * depending on `listing` (PR3), which this slice does not have. It does
 * NOT prove the database behaves this way; that stays unverified until 4.6
 * ships its own integration suite against real Postgres.
 */
describe("PhotoHashPort contract — cross-account duplicate detection", () => {
  // Scenario: "Photo stolen from another publisher is rejected".
  it("4.2: reports a cross-publisher match within maxDistance, none once distance exceeds it", async () => {
    const port = new InMemoryPhotoHashFake();
    const publisherAHash = computeDHashFromGrayscalePixels(solidGray(10));
    port.seed({
      photoId: "photo-a1",
      listingId: "listing-a1",
      publisherId: "publisher-a",
      hash: publisherAHash,
    });

    // Publisher B submits a re-encoded copy: solid grey 10 vs 12 differs
    // numerically but produces the identical dHash — why D4 rejects
    // cryptographic hashing (design.md D4).
    const near = computeDHashFromGrayscalePixels(solidGray(12));
    const matches = await port.findMatchesFromOtherPublishers(near, "publisher-b", MAX_DISTANCE);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ publisherId: "publisher-a", distance: 0 });
    // The future PublishListingUseCase (PR3/PR4 wiring, out of scope
    // here) rejects the submission whenever this array is non-empty.

    // All-ones vs all-zero is the maximum distance, 64 — proves
    // maxDistance actually filters, not just that the fake returns rows.
    const far = computeDHashFromGrayscalePixels(ascendingGradient());
    expect(
      await port.findMatchesFromOtherPublishers(far, "publisher-b", MAX_DISTANCE),
    ).toHaveLength(0);
  });

  // Scenarios: republishing an expired listing, and reusing a photo
  // across two of one's own active listings — same exemption either way.
  it("4.3: excludes the submitting publisher's own matching photo even at distance 0", async () => {
    const port = new InMemoryPhotoHashFake();
    const publisherAHash = computeDHashFromGrayscalePixels(ascendingGradient());
    port.seed({
      photoId: "photo-a1",
      listingId: "listing-a1-expired",
      publisherId: "publisher-a",
      hash: publisherAHash,
    });

    const matches = await port.findMatchesFromOtherPublishers(publisherAHash, "publisher-a", 64);

    expect(matches).toHaveLength(0);
    // Allowed whenever this array is empty — including here, where the
    // distance would be 0 and only the publisher exclusion prevents it.
  });
});

/**
 * Task 4.7 — the write side. Before this, nothing implemented `record`, so
 * `listing_photo_hash` stayed permanently empty and no match could ever
 * fire (attach-photo-to-draft.ts's own "known gap" note, and AGENTS.md §5).
 */
describe("PhotoHashPort contract — recording a hash", () => {
  it("records exactly photoId, hash and recordedAt — no publisherId to leak", async () => {
    const port = new InMemoryPhotoHashFake();
    const hash = computeDHashFromGrayscalePixels(solidGray(10));
    const recordedAt = new Date("2026-08-24T12:00:00.000Z");

    await port.record({ photoId: "photo-new-1", hash, recordedAt });

    expect(port.recorded).toEqual([{ photoId: "photo-new-1", hash, recordedAt }]);
  });
});
