import type { SessionPort } from "../../identity/application/ports/session.port";
import { requireAuthenticatedSession } from "../../identity/application/require-authenticated-session";
import { resolveReportOutcome } from "../domain/report-threshold";
import type { ListingModerationPort } from "./ports/listing-moderation.port";
import type { ListingReportPort } from "./ports/listing-report.port";

/**
 * Task 8.4 — reporting a listing, end to end.
 *
 * Same shape as `revealContact`: the session gate runs before anything is
 * read (tasks.md 8.2 — an anonymous request must not be able to make this
 * function touch the catalogue), and the distinct-account guarantee is not
 * an `if` written here — it is `listing_report_listing_reporter_unique`
 * (schema.ts), read back through `countDistinctReporters`. This function's
 * only real decision is what `resolveReportOutcome` says the listing's next
 * status should be.
 */
export class ListingNotFoundError extends Error {
  constructor(listingId: string) {
    super(`report-listing: listing ${listingId} was not found.`);
    this.name = "ListingNotFoundError";
  }
}

export interface ReportListingRequest {
  readonly listingId: string;
}

export interface ReportListingDependencies {
  readonly sessionPort: SessionPort;
  readonly listings: ListingModerationPort;
  readonly reports: ListingReportPort;
  readonly now?: () => Date;
}

export interface ReportListingResult {
  readonly autoHidden: boolean;
}

export async function reportListing(
  request: ReportListingRequest,
  dependencies: ReportListingDependencies,
): Promise<ReportListingResult> {
  const { sessionPort, listings, reports } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  const session = await requireAuthenticatedSession(sessionPort);

  const listing = await listings.findModerated(request.listingId);
  if (!listing) {
    throw new ListingNotFoundError(request.listingId);
  }

  // Self-reporting is allowed on purpose — see tasks.md 8.4's deviation
  // note. Neither scenario in the spec exempts the publisher, and the
  // threshold is 3 DISTINCT accounts regardless of who holds one of them.
  await reports.record({
    listingId: listing.listingId,
    reporterId: session.userId,
    reportedAt: now(),
  });

  const distinctReporterCount = await reports.countDistinctReporters(listing.listingId);
  const outcome = resolveReportOutcome(listing.status, distinctReporterCount);
  const transitioned = outcome.nextStatus !== listing.status;

  if (transitioned) {
    await listings.setStatus(listing.listingId, outcome.nextStatus);
  }

  // `autoHidden` means "THIS report is the one that hid it", not "it is
  // hidden" — a report on an already-hidden listing must not read back as
  // if it had just triggered the takedown.
  return { autoHidden: transitioned && outcome.nextStatus === "hidden" };
}
