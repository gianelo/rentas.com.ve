import { describe, expect, it } from "vitest";
import { AUTO_HIDE_REPORT_THRESHOLD, resolveReportOutcome } from "./report-threshold";

/**
 * listing-trust spec, Requirement: Auto-Hide After Three Distinct Reports.
 *
 * This is the pure half of tasks.md 8.3/8.4 — everything that decides WHAT
 * the next status should be, with no I/O. The distinct-account counting
 * itself is not this file's job: it is guaranteed by
 * `listing_report_listing_reporter_unique` (schema.ts), the same way
 * `evaluateRevealAllowance` in contact-reveal takes what the port already
 * found and answers one question. This function takes the count the port
 * already computed and decides the listing's next status.
 */
describe("resolveReportOutcome", () => {
  it("keeps an active listing active below the threshold", () => {
    expect(resolveReportOutcome("active", AUTO_HIDE_REPORT_THRESHOLD - 1)).toEqual({
      nextStatus: "active",
    });
  });

  // "Third distinct reporter triggers auto-hide" — the scenario this
  // function exists for.
  it("hides an active listing exactly at the threshold", () => {
    expect(resolveReportOutcome("active", AUTO_HIDE_REPORT_THRESHOLD)).toEqual({
      nextStatus: "hidden",
    });
  });

  it("stays hidden past the threshold — auto-hide is not re-triggered", () => {
    expect(resolveReportOutcome("active", AUTO_HIDE_REPORT_THRESHOLD + 5)).toEqual({
      nextStatus: "hidden",
    });
  });

  // "Repeated reports from the same account do not trigger auto-hide alone"
  // — the count stays 1 (the port's job, not this one), and this function
  // must not hide at a count below the threshold regardless of how it got
  // there.
  it("does not hide when the distinct count is 1, even after many attempts", () => {
    expect(resolveReportOutcome("active", 1)).toEqual({ nextStatus: "active" });
  });

  // DEVIATION recorded in tasks.md 8.4: a report on an already-hidden
  // listing is a no-op on status. The report itself still gets recorded by
  // the port (it is not refused), but hidden stays hidden — there is no
  // "more hidden" state, and re-running the transition would be indistinguishable
  // from doing nothing.
  it("leaves an already-hidden listing hidden", () => {
    expect(resolveReportOutcome("hidden", AUTO_HIDE_REPORT_THRESHOLD + 1)).toEqual({
      nextStatus: "hidden",
    });
  });

  // DEVIATION recorded in tasks.md 8.4: an expired listing must never become
  // hidden from a report, or it would escape `markExpired`'s WHERE clause
  // (`status = 'active'`) and no future sweep would ever touch it again —
  // the listing-lifecycle spec's expiry guarantee failing silently through a
  // different module's write path.
  it("leaves an expired listing expired, never promoting it to hidden", () => {
    expect(resolveReportOutcome("expired", AUTO_HIDE_REPORT_THRESHOLD + 1)).toEqual({
      nextStatus: "expired",
    });
  });
});
