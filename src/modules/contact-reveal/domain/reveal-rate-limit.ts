/**
 * Task 6.10 — per-account reveal rate limit. RESOLVED by the founder
 * 2026-08-24 (design.md, Open Questions: "Contact-reveal rate limit
 * threshold"): 40 DISTINCT listings per rolling 24-hour window. Twice the
 * 20-listing comparison volume the design already accepted as genuine
 * traffic — a real tenant never reaches it, and draining the catalogue at
 * forty a day is not a strategy anyone pursues.
 *
 * **The unit is the listing, never the action.** A tenant re-opening the
 * same advert while comparing options must not be charged for it, so only a
 * listing NOT already inside the window spends allowance.
 *
 * The rolling window itself is not this file's job: the caller (the read
 * port) hands over only the listing ids already inside the trailing 24h, so
 * this function stays free of `Date` entirely and answers one question —
 * does revealing THIS listing spend allowance.
 */
export const REVEAL_RATE_LIMIT_MAX_DISTINCT_LISTINGS = 40;
export const REVEAL_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RevealAllowanceDecision {
  readonly allowed: boolean;
}

export function evaluateRevealAllowance(
  recentlyRevealedListingIds: readonly string[],
  candidateListingId: string,
): RevealAllowanceDecision {
  const distinct = new Set(recentlyRevealedListingIds);

  // Already inside the window: no new listing is being drained, so no
  // allowance is spent regardless of how close to the limit the account is.
  if (distinct.has(candidateListingId)) {
    return { allowed: true };
  }

  return { allowed: distinct.size < REVEAL_RATE_LIMIT_MAX_DISTINCT_LISTINGS };
}
