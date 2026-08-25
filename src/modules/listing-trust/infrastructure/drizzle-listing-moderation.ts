import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { listingReports, listings, moderationActions } from "../../../shared/db/schema";
import type {
  ListingModerationPort,
  ModeratedListing,
} from "../application/ports/listing-moderation.port";
import type { ListingReportPort, NewListingReport } from "../application/ports/listing-report.port";
import type {
  ModerationActionPort,
  NewModerationAction,
} from "../application/ports/moderation-action.port";
import type { ListingModerationStatus } from "../domain/report-threshold";
import type { TrustDatabase } from "./drizzle-photo-hash";

/**
 * The reporting/moderation tables against real Postgres (tasks.md 8.1).
 *
 * Same handle-by-constructor shape as `DrizzlePhotoHash` and every other
 * infrastructure adapter in this codebase: production passes the Neon
 * client, `tests/integration/listing-trust.test.ts` passes a `node-postgres`
 * pool pointed at a disposable container, and both run this exact code.
 */

export class DrizzleListingModeration implements ListingModerationPort {
  constructor(private readonly db: TrustDatabase) {}

  async findModerated(listingId: string): Promise<ModeratedListing | null> {
    const rows = await this.db
      .select({
        listingId: listings.id,
        status: listings.status,
        expiresAt: listings.expiresAt,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    return rows[0] ?? null;
  }

  async setStatus(listingId: string, status: ListingModerationStatus): Promise<void> {
    await this.db.update(listings).set({ status }).where(eq(listings.id, listingId));
  }
}

export class DrizzleListingReports implements ListingReportPort {
  constructor(private readonly db: TrustDatabase) {}

  /**
   * `ON CONFLICT DO NOTHING` against `listing_report_listing_reporter_unique`
   * — the guarantee is the constraint, not a read-before-write here. A
   * repeat report from the same account collides with the index and this
   * simply inserts zero rows.
   */
  async record(report: NewListingReport): Promise<void> {
    await this.db
      .insert(listingReports)
      .values({
        id: randomUUID(),
        listingId: report.listingId,
        reporterId: report.reporterId,
        reportedAt: report.reportedAt,
      })
      .onConflictDoNothing();
  }

  /**
   * A plain `count(*)`, not `count(DISTINCT reporter_id)` — the unique
   * constraint already guarantees every row is a distinct account.
   */
  async countDistinctReporters(listingId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(listingReports)
      .where(eq(listingReports.listingId, listingId));

    return result[0]?.count ?? 0;
  }
}

export class DrizzleModerationActions implements ModerationActionPort {
  constructor(private readonly db: TrustDatabase) {}

  async record(action: NewModerationAction): Promise<void> {
    await this.db.insert(moderationActions).values({
      id: randomUUID(),
      listingId: action.listingId,
      action: action.action,
      createdAt: action.createdAt,
    });
  }
}
