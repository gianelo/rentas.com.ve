import { describe, expect, it } from "vitest";
import { resolveRestoreOutcome } from "./restore-outcome";

/**
 * listing-trust spec, Requirement: Operator Restore (tasks.md 8.5).
 *
 * Pure and I/O-free — `now` is a parameter, following the same convention
 * `expiry.ts` (listing-lifecycle) already established for date logic.
 */
describe("resolveRestoreOutcome", () => {
  const NOW = new Date("2026-03-01T10:00:00.000Z");
  const FUTURE = new Date("2026-04-01T10:00:00.000Z");
  const PAST = new Date("2026-02-01T10:00:00.000Z");

  // listing-trust spec, Scenario "Operator restores a wrongly hidden
  // listing".
  it("restores a hidden listing that has not expired to active", () => {
    expect(resolveRestoreOutcome("hidden", FUTURE, NOW)).toEqual({
      allowed: true,
      nextStatus: "active",
    });
  });

  // "provided it has not also expired" — the spec's own caveat. Restore
  // must not resurrect a listing whose expiry has already passed while it
  // sat hidden (hidden listings are excluded from `markExpired`'s sweep, so
  // nothing else would have caught this).
  it("restores a hidden listing whose expiry already passed to expired, not active", () => {
    expect(resolveRestoreOutcome("hidden", PAST, NOW)).toEqual({
      allowed: true,
      nextStatus: "expired",
    });
  });

  // A listing that is not hidden has nothing to restore — an already-active
  // or already-expired listing must be refused, not silently no-op'd into
  // one status or the other.
  it.each([
    ["active", FUTURE],
    ["expired", PAST],
  ] as const)("refuses to restore a listing that is not hidden (%s)", (status, expiresAt) => {
    expect(resolveRestoreOutcome(status, expiresAt, NOW)).toEqual({ allowed: false });
  });

  // Matches listing-lifecycle's own `isExpired` convention exactly
  // ("estrictamente después: en el instante exacto el aviso todavía vive")
  // — the two must not disagree about the same instant.
  it("treats the exact expiry instant as still active, not yet expired", () => {
    expect(resolveRestoreOutcome("hidden", NOW, NOW)).toEqual({
      allowed: true,
      nextStatus: "active",
    });
  });
});
