import type { ListingModerationStatus } from "../../domain/report-threshold";

/**
 * The read/write side of a listing's moderation status, shared by
 * `reportListing` (tasks.md 8.4) and `restoreListing` (tasks.md 8.6).
 *
 * One port and not two, because both use cases need the exact same two
 * facts about a listing — its current status and its `expiresAt` — and the
 * exact same one mutation: move it to a different status. Splitting this
 * into a `ReportableListingPort` and a `RestorableListingPort` would give
 * each use case its own copy of a query that reads the same three columns
 * off the same table.
 */
export interface ModeratedListing {
  readonly listingId: string;
  readonly status: ListingModerationStatus;
  readonly expiresAt: Date;
}

export interface ListingModerationPort {
  findModerated(listingId: string): Promise<ModeratedListing | null>;
  /** No-op-safe: callers only invoke this when the status is actually changing. */
  setStatus(listingId: string, status: ListingModerationStatus): Promise<void>;
}
