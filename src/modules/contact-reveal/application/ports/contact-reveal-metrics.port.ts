/**
 * The read side of D6: one row per unique `(tenant, listing)` pair. This is
 * the go/pivot number, so the port returns rows rather than a bare count —
 * `first_revealed_at` is what makes the cohort reading possible (a pair
 * counts in the month of its FIRST reveal, never again), and `revealCount`
 * is the raw action figure the same pair contributed.
 */
export interface UniqueRevealPair {
  readonly tenantUserId: string;
  readonly listingId: string;
  /** First-reveal values: the view keeps the earliest row of the pair. */
  readonly publisherId: string;
  readonly cityId: string;
  readonly firstRevealedAt: Date;
  /** How many raw events this one pair holds. Always >= 1. */
  readonly revealCount: number;
}

/**
 * Every field optional, because "all pairs" is a legitimate question (the
 * headline count) and so is any narrowing of it. The contact-reveal spec
 * requires counts per city and per listing; `tenantUserId` is here because
 * "has this tenant already revealed this listing" is the same lookup, and a
 * second port for it would be a second place the view name is written down.
 */
export interface UniquePairFilter {
  readonly listingId?: string;
  readonly cityId?: string;
  readonly tenantUserId?: string;
}

export interface ContactRevealMetricsPort {
  findUniquePairs(filter: UniquePairFilter): Promise<readonly UniqueRevealPair[]>;
}
