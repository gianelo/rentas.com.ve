/**
 * Task 6.9/6.10 — the read side of the per-account reveal rate limit
 * (design.md, Open Questions: "Contact-reveal rate limit threshold",
 * RESOLVED 2026-08-24). Kept as its own port rather than adding a read
 * method to `ContactRevealEventPort`: that port is deliberately write-only
 * so nothing can weaken its append-only guarantee, and this need is a read.
 */
export interface RevealRateLimitPort {
  /**
   * Every DISTINCT listing id this tenant has revealed at least once since
   * `since`. The domain rule counts listings, not reveal actions — a repeat
   * reveal of a listing already in this list must not consume allowance
   * (`evaluateRevealAllowance`, reveal-rate-limit.ts).
   */
  findRecentlyRevealedListingIds(tenantUserId: string, since: Date): Promise<readonly string[]>;
}

/**
 * Task 6.14 — the read side of "the contact action opens with the submitted
 * message already written". Kept alongside `RevealRateLimitPort` for the
 * same reason: `ContactRevealEventPort` stays write-only, and both of these
 * are reads over the same append-only log.
 */
export interface RevealMessageHistoryPort {
  /**
   * The tenant's MOST RECENT message for this `(tenant, listing)` pair.
   * Repeat reveals each write their own row (task 6.4, never deduplicated),
   * so "latest" is the message they meant when they last opened the contact
   * action. `null` covers two cases the caller cannot and must not tell
   * apart from this alone: the tenant never revealed this listing, or their
   * only reveal(s) predate the message requirement (task 6.11's historical
   * `NULL` rows) — either way, there is nothing authoritative to prefill.
   */
  findLatestMessage(tenantUserId: string, listingId: string): Promise<string | null>;
}
