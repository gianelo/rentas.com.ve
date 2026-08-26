import type { ListingModerationStatus } from "./report-threshold";

/**
 * listing-trust spec, Requirement: Operator Restore (tasks.md 8.5/8.6).
 *
 * Pure and I/O-free — `now` enters as a parameter, the same convention
 * `listing-lifecycle/domain/expiry.ts` already established, and the
 * "strictly after" comparison matches that file's `isExpired` exactly so
 * the two modules never disagree about the same instant.
 */

export type RestoreResultStatus = "active" | "expired";

export type RestoreDecision =
  | { readonly allowed: false }
  | { readonly allowed: true; readonly nextStatus: RestoreResultStatus };

/**
 * **Only a `hidden` listing may be restored.** An already-`active` or
 * already-`expired` listing is refused outright rather than silently
 * no-op'd into whichever status it already holds — there is nothing here
 * for the operator action to have done.
 *
 * **"provided it has not also expired" (the spec's own words).** A hidden
 * listing is excluded from `markExpired`'s sweep (listing-lifecycle), so its
 * `expiresAt` can sit in the past for as long as it stays hidden. Restoring
 * it straight to `active` would resurrect a listing time has already retired
 * — the exact failure this function exists to prevent. It goes to `expired`
 * instead, which is both true and still renewable through the ordinary
 * lifecycle flow.
 */
export function resolveRestoreOutcome(
  currentStatus: ListingModerationStatus,
  expiresAt: Date,
  now: Date,
): RestoreDecision {
  if (currentStatus !== "hidden") {
    return { allowed: false };
  }

  const hasExpired = now.getTime() > expiresAt.getTime();
  return { allowed: true, nextStatus: hasExpired ? "expired" : "active" };
}
