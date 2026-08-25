import { describe, expect, it } from "vitest";
import { isBulkImportAuthorized } from "./bulk-import-authorization";

/**
 * broker-bulk-import spec, Requirement: Operator-Granted Access (tasks.md 9.2/9.3).
 *
 * **This is the whole rule, on purpose.** Everything above this function —
 * the route, the session lookup, the account read — exists only to bring one
 * boolean here. Keeping the decision this small is what lets a second import
 * endpoint (upload, confirm, photo attach — 9.7+) reuse the exact same
 * check instead of writing its own `if`, the same reasoning
 * `operator-authorization.ts` and `cron-authorization.ts` already apply.
 */
describe("isBulkImportAuthorized", () => {
  it("authorises an account whose flag is explicitly true", () => {
    expect(isBulkImportAuthorized({ bulkImportEnabled: true })).toBe(true);
  });

  it("refuses an account whose flag is false", () => {
    expect(isBulkImportAuthorized({ bulkImportEnabled: false })).toBe(false);
  });

  // Fail closed (AGENTS.md §7): an account the port could not find is
  // refused, never treated as implicitly enabled.
  it("refuses when the account could not be read", () => {
    expect(isBulkImportAuthorized(null)).toBe(false);
  });
});
