import type { SessionPort } from "../../identity/application/ports/session.port";
import { requireAuthenticatedSession } from "../../identity/application/require-authenticated-session";
import { evaluateRevealAllowance, REVEAL_RATE_LIMIT_WINDOW_MS } from "../domain/reveal-rate-limit";
import { type ContactPresentation, presentContact } from "../domain/revealable-contact";
import type { ContactRevealEventPort } from "./ports/contact-reveal-event.port";
import type { RevealRateLimitPort } from "./ports/reveal-rate-limit.port";
import type { RevealableListingPort } from "./ports/revealable-listing.port";

/**
 * Task 6.5 — revealing a publisher's contact, end to end.
 *
 * Two guarantees live here and nowhere else. The session gate runs first, so
 * an anonymous caller cannot make this function read the catalogue. And the
 * write is **exactly one insert with no read-before-write**: a repeat reveal
 * by the same tenant produces a second row, on purpose (task 6.4). Collapsing
 * it here would delete the raw action count the contact-reveal spec also
 * requires, permanently — `contact_reveal_unique_pair` deduplicates rows that
 * exist, and nothing recovers rows never written.
 */
export class ListingNotRevealableError extends Error {
  constructor(listingId: string) {
    super(`reveal-contact: listing ${listingId} is not revealable.`);
    this.name = "ListingNotRevealableError";
  }
}

/**
 * Task 6.9/6.10 — thrown when an account has already revealed 40 distinct
 * listings inside the rolling 24h window and attempts a 41st. The refusal
 * writes no event and discloses no contact value (contact-reveal spec, "An
 * account at the limit is refused").
 */
export class RevealRateLimitExceededError extends Error {
  constructor(tenantUserId: string) {
    super(`reveal-contact: account ${tenantUserId} is over the reveal rate limit.`);
    this.name = "RevealRateLimitExceededError";
  }
}

export interface RevealContactRequest {
  readonly listingId: string;
}

export interface RevealContactDependencies {
  readonly sessionPort: SessionPort;
  readonly listings: RevealableListingPort;
  readonly events: ContactRevealEventPort;
  readonly rateLimit: RevealRateLimitPort;
  readonly now?: () => Date;
}

export async function revealContact(
  request: RevealContactRequest,
  dependencies: RevealContactDependencies,
): Promise<ContactPresentation> {
  const { sessionPort, listings, events, rateLimit } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  const session = await requireAuthenticatedSession(sessionPort);

  const listing = await listings.findRevealable(request.listingId);
  if (!listing) {
    throw new ListingNotRevealableError(request.listingId);
  }

  // Task 6.9/6.10 — the unit is the listing, never the action: revealing a
  // listing already inside the window spends no allowance, so the check runs
  // against the listing just read, not against the raw request.
  const windowStart = new Date(now().getTime() - REVEAL_RATE_LIMIT_WINDOW_MS);
  const recentlyRevealed = await rateLimit.findRecentlyRevealedListingIds(
    session.userId,
    windowStart,
  );
  const allowance = evaluateRevealAllowance(recentlyRevealed, listing.listingId);
  if (!allowance.allowed) {
    throw new RevealRateLimitExceededError(session.userId);
  }

  // `publisherId` and `cityId` come from the row just read, not from the
  // request — a caller able to state the city could file every reveal under
  // whichever city made the go/pivot number look best.
  await events.record({
    listingId: listing.listingId,
    publisherId: listing.publisherId,
    tenantUserId: session.userId,
    cityId: listing.cityId,
    revealedAt: now(),
  });

  // Recorded first, then shown. If the insert fails the tenant sees an error
  // rather than a number the metric never learned about — an under-count is
  // recoverable from the log, a silent uncounted reveal is not.
  return presentContact(
    { method: listing.contactMethod, value: listing.contactValue },
    { hasRevealed: true },
  );
}
