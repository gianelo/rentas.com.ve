import { resolveRestoreOutcome } from "../domain/restore-outcome";
import type { ListingModerationPort } from "./ports/listing-moderation.port";
import type { ModerationActionPort } from "./ports/moderation-action.port";

/**
 * Task 8.6 — restoring an auto-hidden listing, end to end.
 *
 * **Deliberately carries no auth check of its own.** Same split as
 * `sendLifecycleNotices`/`isAuthorizedJobRequest`: the operator secret is
 * verified by the route before this function is ever called, so this layer
 * only has to answer "is this a hidden listing, and what should restoring it
 * do" — the same reason `revealContact` and `reportListing` are the ones
 * that know about sessions while `renew` does not.
 */
export class ListingNotFoundError extends Error {
  constructor(listingId: string) {
    super(`restore-listing: listing ${listingId} was not found.`);
    this.name = "ListingNotFoundError";
  }
}

/** Thrown for a listing that is not currently `hidden` — nothing to restore. */
export class ListingNotHiddenError extends Error {
  constructor(listingId: string) {
    super(`restore-listing: listing ${listingId} is not hidden.`);
    this.name = "ListingNotHiddenError";
  }
}

export interface RestoreListingRequest {
  readonly listingId: string;
}

export interface RestoreListingDependencies {
  readonly listings: ListingModerationPort;
  readonly moderationActions: ModerationActionPort;
  readonly now?: () => Date;
}

export interface RestoreListingResult {
  readonly status: "active" | "expired";
}

export async function restoreListing(
  request: RestoreListingRequest,
  dependencies: RestoreListingDependencies,
): Promise<RestoreListingResult> {
  const { listings, moderationActions } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  const listing = await listings.findModerated(request.listingId);
  if (!listing) {
    throw new ListingNotFoundError(request.listingId);
  }

  const decision = resolveRestoreOutcome(listing.status, listing.expiresAt, now());
  if (!decision.allowed) {
    throw new ListingNotHiddenError(request.listingId);
  }

  await listings.setStatus(listing.listingId, decision.nextStatus);
  await moderationActions.record({
    listingId: listing.listingId,
    action: "restore",
    createdAt: now(),
  });

  return { status: decision.nextStatus };
}
