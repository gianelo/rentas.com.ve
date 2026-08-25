/**
 * tasks.md 8.4 — the write and count sides of a report.
 *
 * `record` is idempotent by construction, not by an `if` here: the adapter
 * inserts against `listing_report_listing_reporter_unique`
 * (schema.ts) and a repeat report from the same account collides with the
 * index instead of creating a second row. That is what makes
 * `countDistinctReporters` a plain `count(*)` rather than a
 * `count(DISTINCT reporter_id)` — every row already IS one distinct account.
 */
export interface NewListingReport {
  readonly listingId: string;
  readonly reporterId: string;
  readonly reportedAt: Date;
}

export interface ListingReportPort {
  record(report: NewListingReport): Promise<void>;
  countDistinctReporters(listingId: string): Promise<number>;
}
