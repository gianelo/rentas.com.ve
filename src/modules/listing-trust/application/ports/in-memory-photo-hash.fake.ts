import { hammingDistance } from "../../domain/hamming-distance";
import type { PerceptualHash } from "../../domain/perceptual-hash";
import type { PhotoHashMatch, PhotoHashPort, PublisherId } from "./photo-hash.port";

interface StoredPhoto {
  photoId: string;
  listingId: string;
  publisherId: PublisherId;
  hash: PerceptualHash;
}

/**
 * An in-memory PhotoHashPort proving the port CONTRACT (tasks 4.2, 4.3)
 * before the real adapter exists — task 4.6 builds on `listing` (PR3),
 * which this slice does not have. Not a stub returning a canned value: it
 * stores real tuples and applies the real domain `hammingDistance` against
 * `maxDistance`, so a test against this fake genuinely exercises the
 * publisher-exclusion and distance-threshold semantics, not a tautology.
 *
 * SAID PLAINLY: this proves the port CONTRACT, not the database. It says
 * NOTHING about the real Drizzle/SQL adapter's `bit_count` query,
 * `bit(64)` storage, or index behaviour — unverified until 4.6 ships its
 * own suite against real Postgres (design.md, Testing Strategy).
 */
export class InMemoryPhotoHashFake implements PhotoHashPort {
  private readonly photos: StoredPhoto[] = [];

  seed(photo: StoredPhoto): void {
    this.photos.push(photo);
  }

  async findMatchesFromOtherPublishers(
    hash: PerceptualHash,
    excludePublisherId: PublisherId,
    maxDistance: number,
  ): Promise<PhotoHashMatch[]> {
    return this.photos
      .filter((photo) => photo.publisherId !== excludePublisherId)
      .map((photo) => ({ photo, distance: hammingDistance(hash, photo.hash) }))
      .filter(({ distance }) => distance <= maxDistance)
      .map(({ photo, distance }) => ({
        photoId: photo.photoId,
        listingId: photo.listingId,
        publisherId: photo.publisherId,
        distance,
      }));
  }
}
