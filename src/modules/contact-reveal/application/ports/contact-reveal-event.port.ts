/**
 * The append-only write side of the north-star metric (design.md D6).
 *
 * **There is no `update`, no `delete`, and no `findOrCreate` here, and that
 * is the whole point.** The metric has two definitions that must both
 * survive — every reveal action, and unique `(tenant, listing)` pairs — and
 * they are served by one table plus one view. The moment this port could
 * collapse a repeat reveal, the raw action count would be gone for good: a
 * view can always deduplicate rows that exist, and nothing can recover rows
 * that were never written.
 */
export interface NewContactRevealEvent {
  readonly listingId: string;
  readonly publisherId: string;
  /** The signed-in tenant. Comes from the session, never from the request. */
  readonly tenantUserId: string;
  /**
   * Copied at write time rather than joined later. A listing can be edited,
   * expired, hidden or removed; a metric a JOIN can erase is not a metric.
   */
  readonly cityId: string;
  readonly revealedAt: Date;
  /**
   * Required going forward (tasks.md 6.11/6.13) — `revealContact` never
   * calls `record` without one, `requireRevealMessage` guarantees that.
   * `NULL` in the column stays reserved for rows written before this
   * requirement existed; this port never writes that value.
   */
  readonly message: string;
}

export interface ContactRevealEventPort {
  record(event: NewContactRevealEvent): Promise<void>;
}
