/**
 * listing-trust spec, Requirement: Auto-Hide After Three Distinct Reports
 * (tasks.md 8.3/8.4).
 *
 * **The unit is the account, never the row, and this file is not where that
 * guarantee lives.** `listing_report_listing_reporter_unique` (schema.ts) is
 * what makes a repeat report from the same account a no-op instead of a
 * second row — the same "the guarantee is the constraint, not an `if`"
 * reasoning `listing_reminder_cycle_unique` already applies in
 * listing-lifecycle. By the time a distinct count reaches this function, it
 * is already distinct by construction; this file only decides what the
 * count means for the listing's status.
 *
 * Pure and I/O-free, like `evaluateRevealAllowance` in contact-reveal: it
 * takes what the port already found (a count) and answers one question.
 */

/**
 * Widened to `draft` alongside `listing.status` itself (schema.ts, tasks.md
 * 9.1). Safe without a new branch: `resolveReportOutcome` already guards on
 * `currentStatus !== "active"` and returns the status unchanged for
 * anything else, so a reported draft (which should never happen — drafts
 * are excluded from search and therefore unreachable from the report
 * button) is a silent no-op rather than a mis-hide. `resolveRestoreOutcome`
 * below guards symmetrically on `!== "hidden"`. Deciding what `draft`
 * itself MEANS to moderation is 9.18/9.19's job, not this widening's.
 */
export type ListingModerationStatus = "active" | "expired" | "hidden" | "draft";

export const AUTO_HIDE_REPORT_THRESHOLD = 3;

export interface ReportOutcome {
  readonly nextStatus: ListingModerationStatus;
}

/**
 * **Two deviations from the literal task text, both decided here and
 * recorded in tasks.md 8.4 rather than left for the code to decide
 * silently:**
 *
 * 1. A report on a listing that is not `active` (already `hidden`, or
 *    `expired`) never changes its status. Hiding an already-hidden listing
 *    is a no-op by definition — there is no "more hidden". Hiding an
 *    expired listing would let it escape `markExpired`'s `WHERE status =
 *    'active'` clause forever, which is the listing-lifecycle spec's expiry
 *    guarantee breaking through a different module's write path.
 * 2. Once hidden, a listing stays hidden regardless of how many further
 *    distinct reports arrive — auto-hide is a one-way transition; only
 *    `restoreListing` (an operator action) reverses it.
 */
export function resolveReportOutcome(
  currentStatus: ListingModerationStatus,
  distinctReporterCount: number,
): ReportOutcome {
  if (currentStatus !== "active") {
    return { nextStatus: currentStatus };
  }

  return {
    nextStatus: distinctReporterCount >= AUTO_HIDE_REPORT_THRESHOLD ? "hidden" : "active",
  };
}
