import type { SessionPort } from "../../identity/application/ports/session.port";
import { requireAuthenticatedSession } from "../../identity/application/require-authenticated-session";
import { expiryFor } from "../../listing-lifecycle/domain/expiry";
import { type PublishViolation, validatePublishableListing } from "../domain/publishable-listing";
import type { ListingActivationPort } from "./ports/listing-activation.port";
import type { ZoneCataloguePort } from "./ports/zone-catalogue.port";

/**
 * broker-bulk-import spec, "Drafts Are Not Published Listings" (tasks.md
 * 9.18/9.19): "A draft MUST become active only once it satisfies minimum
 * publishable content and passes trust checks."
 *
 * **Not a task the tasks.md text named — an activation path is inferred
 * work, recorded per AGENTS.md §5.** 9.18 says a draft's "30 days start at
 * activation" and 9.27's e2e says "drafts activate", but nothing before this
 * slice builds the transition itself. `stage: "draft"` (tasks.md 9.15)
 * exists precisely so a draft could be WRITTEN without photos; nothing
 * re-validates it at `"activation"` before it could ever become searchable
 * and revealable. Without this file, 9.18's own guarantee — "becomes active
 * only once it satisfies minimum publishable content" — is unenforced and
 * untestable.
 *
 * **Lives in `listing-publication`, not `broker-bulk-import`.** Activation
 * is a publish-rules concept — it reuses `validatePublishableListing`
 * verbatim, the same function `publishListing` already calls — and nothing
 * about it is specific to how the draft was created. `broker-bulk-import` is
 * the only module that creates a `draft` today, but this use case does not
 * know that; a future draft source would activate through the exact same
 * path.
 */

export class ActivateListingNotFoundError extends Error {
  constructor(listingId: string) {
    super(`activate-listing: draft ${listingId} was not found.`);
    this.name = "ActivateListingNotFoundError";
  }
}

/**
 * Same shape as 9.20's photo-ownership rule (`process-uploaded-photo.ts`'s
 * `key.notOwnedByPublisher`): an explicit rejection, not a silent 404. A
 * broker who mistypes or guesses another broker's draft id is told they do
 * not own it, not left to wonder whether the id exists at all — the
 * existence question is already answered by `ActivateListingNotFoundError`
 * for ids that are not currently a draft of ANYONE's.
 */
export class ActivateListingNotOwnedError extends Error {
  constructor(listingId: string) {
    super(`activate-listing: draft ${listingId} does not belong to the caller.`);
    this.name = "ActivateListingNotOwnedError";
  }
}

export class ActivateListingRejectedError extends Error {
  readonly violations: readonly PublishViolation[];

  constructor(violations: readonly PublishViolation[]) {
    super(`activate-listing: rejected (${violations.join(", ")})`);
    this.name = "ActivateListingRejectedError";
    this.violations = violations;
  }
}

export interface ActivateListingRequest {
  readonly listingId: string;
}

export interface ActivateListingDependencies {
  readonly sessionPort: SessionPort;
  readonly zones: ZoneCataloguePort;
  readonly listings: ListingActivationPort;
  readonly now?: () => Date;
}

export interface ActivateListingResult {
  readonly listingId: string;
  readonly publishedAt: Date;
  readonly expiresAt: Date;
}

export async function activateListing(
  request: ActivateListingRequest,
  dependencies: ActivateListingDependencies,
): Promise<ActivateListingResult> {
  const { sessionPort, zones, listings } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  // Session gate first, before any read — the same order `publishListing`
  // and `reportListing` use, and for the same reason: an unauthenticated
  // caller must not be able to make this function touch the catalogue.
  const session = await requireAuthenticatedSession(sessionPort);

  const draft = await listings.findDraftById(request.listingId);
  if (!draft) {
    throw new ActivateListingNotFoundError(request.listingId);
  }

  // Ownership BEFORE re-validation and BEFORE the write. A stranger's draft
  // must not leak whether it would pass or fail publish rules.
  if (draft.publisherId !== session.userId) {
    throw new ActivateListingNotOwnedError(request.listingId);
  }

  const curatedZones = await zones.listZonesForCity(draft.cityId);

  // The re-validation 9.18 requires. `stage: "draft"` (tasks.md 9.15) let
  // this row be written with zero photos; `"activation"` is the ONE place
  // that gap closes — same rule set, same function, no second copy of the
  // photo-count check.
  const violations = validatePublishableListing(draft, curatedZones, "activation");
  if (violations.length > 0) {
    throw new ActivateListingRejectedError(violations);
  }

  const publishedAt = now();
  // The 30 days are `expiryFor`'s number, not this file's. `lastRenewedAt:
  // null` is literal — a draft has never been renewed — so `expiryFor`'s
  // `Math.max` anchor collapses to exactly `publishedAt`, the same "clock
  // starts now" `publishListing` gets from its own inline computation, but
  // sourced from the one place `LISTING_LIFETIME_DAYS` is allowed to live.
  const expiresAt = expiryFor({ publishedAt, lastRenewedAt: null });

  const activated = await listings.activate(draft.id, publishedAt, expiresAt);
  if (!activated) {
    // The draft was still a draft when `findDraftById` read it above, but a
    // concurrent activation won the race on the compare-and-swap `UPDATE`.
    // Treated identically to "not found": there is nothing left here for
    // THIS call to have done, and re-activating an already-active listing
    // is not a recoverable state a second attempt should retry into.
    throw new ActivateListingNotFoundError(request.listingId);
  }

  return { listingId: draft.id, publishedAt, expiresAt };
}
