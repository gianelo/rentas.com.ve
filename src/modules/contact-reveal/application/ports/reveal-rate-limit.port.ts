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
