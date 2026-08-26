/**
 * tasks.md 8.6 — the append-only moderation log's write side.
 *
 * Only `restoreListing` calls this, never `reportListing`: design.md's Data
 * Model line is explicit that auto-hide is the `listing_report` rows
 * reaching the threshold, and `moderation_action` records what an OPERATOR
 * did, not what the auto-hide pipeline did on its own.
 */
export interface NewModerationAction {
  readonly listingId: string;
  /** Closed list of one today — see schema.ts's comment on `moderation_action.action`. */
  readonly action: "restore";
  readonly createdAt: Date;
}

export interface ModerationActionPort {
  record(action: NewModerationAction): Promise<void>;
}
