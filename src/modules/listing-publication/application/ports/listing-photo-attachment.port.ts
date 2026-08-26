import type { NewListingPhoto } from "./listing-repository.port";

/**
 * broker-bulk-import spec, "Photos Attached Through the Existing Upload
 * Path" (tasks.md 9.20/9.21) — the write half of attaching ONE photo to a
 * listing row that already exists.
 *
 * **A port beside `ListingRepositoryPort`, not a widening of it** (AGENTS.md
 * §3, the same reasoning `ListingActivationPort` already documents for its
 * own read half). `ListingRepositoryPort.save` writes a brand-new listing
 * plus every one of its photos inside a single transaction, on the premise
 * that a listing with no photo row is invalid — `photos.required` is a
 * publish rule enforced at `"activation"` stage, never at `"draft"`
 * creation (tasks.md 9.15). An imported draft is created with zero photos
 * on purpose, so appending a photo afterwards is a genuinely different
 * write: it targets a row that already exists, one photo at a time, and it
 * must never be reachable through `save`'s all-at-once shape.
 *
 * This port carries no lookup of its own. `attachPhotoToDraft` establishes
 * ownership and the photo-count ceiling through `ListingActivationPort`'s
 * `findDraftById` BEFORE ever calling this — the same "ownership before any
 * write" order `activate` itself follows.
 */
export interface ListingPhotoAttachmentPort {
  /**
   * `createdAt` is caller-supplied rather than defaulted inside the adapter
   * — the same reasoning `DrizzleListingRepository.save` follows: the clock
   * belongs to the use case that decided the moment, not to the row a port
   * writes.
   *
   * `photo.position` is the caller's to set; `listing_photo_position_unique`
   * (schema.ts) is what refuses two photos claiming the same slot on the
   * same listing — a concurrent attach racing this exact call fails loudly
   * on that constraint rather than silently overwriting an existing photo's
   * order.
   */
  /**
   * Returns the id the adapter generated for the new row (task 4.7) — the
   * only way `attachPhotoToDraft` can later record that SAME photo's
   * perceptual hash: `listing_photo_hash.photo_id` references
   * `listing_photo.id`, so the hash cannot be written before this call
   * returns which id it wrote.
   */
  attachPhoto(
    listingId: string,
    photo: NewListingPhoto,
    createdAt: Date,
  ): Promise<{ readonly photoId: string }>;
}
