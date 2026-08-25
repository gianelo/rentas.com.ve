import { describe, expect, it, vi } from "vitest";
import type { ListingModerationPort, ModeratedListing } from "./ports/listing-moderation.port";
import type { ModerationActionPort, NewModerationAction } from "./ports/moderation-action.port";
import { ListingNotFoundError, ListingNotHiddenError, restoreListing } from "./restore-listing";

const HIDDEN_LISTING: ModeratedListing = {
  listingId: "listing-1",
  status: "hidden",
  expiresAt: new Date("2026-09-30T00:00:00.000Z"),
};

function recordingListings(listing: ModeratedListing | null) {
  const statusChanges: Array<{ listingId: string; status: string }> = [];
  const port: ListingModerationPort = {
    findModerated: vi.fn().mockResolvedValue(listing),
    setStatus: async (listingId, status) => {
      statusChanges.push({ listingId, status });
    },
  };
  return { port, statusChanges };
}

function recordingModerationActions() {
  const written: NewModerationAction[] = [];
  const port: ModerationActionPort = {
    record: async (action) => {
      written.push(action);
    },
  };
  return { port, written };
}

function dependencies(
  listing: ModeratedListing | null,
  now = new Date("2026-03-01T10:00:00.000Z"),
) {
  const listings = recordingListings(listing);
  const moderationActions = recordingModerationActions();

  return {
    listings: listings.port,
    statusChanges: listings.statusChanges,
    moderationActions: moderationActions.port,
    written: moderationActions.written,
    now: () => now,
  };
}

describe("restoreListing", () => {
  // listing-trust spec, Scenario "Operator restores a wrongly hidden
  // listing" (tasks.md 8.5).
  it("returns a hidden listing to active and records a moderation_action", async () => {
    const deps = dependencies(HIDDEN_LISTING);

    const result = await restoreListing({ listingId: "listing-1" }, deps);

    expect(deps.statusChanges).toEqual([{ listingId: "listing-1", status: "active" }]);
    expect(deps.written).toEqual([
      { listingId: "listing-1", action: "restore", createdAt: deps.now() },
    ]);
    expect(result).toEqual({ status: "active" });
  });

  // "provided it has not also expired" — restore must not resurrect a
  // listing whose expiry passed while it sat hidden.
  it("returns an already-expired hidden listing to expired, not active", async () => {
    const past = new Date("2026-02-01T00:00:00.000Z");
    const deps = dependencies({ ...HIDDEN_LISTING, expiresAt: past });

    const result = await restoreListing({ listingId: "listing-1" }, deps);

    expect(deps.statusChanges).toEqual([{ listingId: "listing-1", status: "expired" }]);
    // Still an operator action worth logging, even though the outcome is
    // "expired" rather than "active" — the operator did clear the hold.
    expect(deps.written).toHaveLength(1);
    expect(result).toEqual({ status: "expired" });
  });

  it("throws when the listing does not exist", async () => {
    const deps = dependencies(null);

    await expect(restoreListing({ listingId: "gone" }, deps)).rejects.toThrow(ListingNotFoundError);
    expect(deps.written).toHaveLength(0);
  });

  // A listing that is not hidden has nothing to restore — refusing loudly
  // rather than silently no-op'ing an active listing back to "active".
  it.each(["active", "expired"] as const)(
    "refuses to restore a listing that is not hidden (%s)",
    async (status) => {
      const deps = dependencies({ ...HIDDEN_LISTING, status });

      await expect(restoreListing({ listingId: "listing-1" }, deps)).rejects.toThrow(
        ListingNotHiddenError,
      );
      expect(deps.statusChanges).toHaveLength(0);
      expect(deps.written).toHaveLength(0);
    },
  );
});
