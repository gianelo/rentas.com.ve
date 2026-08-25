import { describe, expect, it } from "vitest";
import {
  evaluateRevealAllowance,
  REVEAL_RATE_LIMIT_MAX_DISTINCT_LISTINGS,
} from "./reveal-rate-limit";

/**
 * Task 6.9 — the per-account reveal rate limit, RESOLVED by the founder
 * 2026-08-24: 40 distinct listings per rolling 24h (design.md, Open
 * Questions). Time itself never enters this file — the rolling window is the
 * port's job (it hands over only the ids already inside the window); this
 * function only ever answers "does revealing THIS listing spend allowance".
 */
describe("evaluateRevealAllowance", () => {
  it("allows a reveal when the account is below the limit", () => {
    const recent = Array.from({ length: 39 }, (_, i) => `listing-${i}`);

    expect(evaluateRevealAllowance(recent, "listing-new").allowed).toBe(true);
  });

  it("refuses the 41st distinct listing once 40 are already inside the window", () => {
    const recent = Array.from(
      { length: REVEAL_RATE_LIMIT_MAX_DISTINCT_LISTINGS },
      (_, i) => `listing-${i}`,
    );

    expect(evaluateRevealAllowance(recent, "listing-41").allowed).toBe(false);
  });

  // The unit is the listing, not the action: re-opening the same advert while
  // comparing options must not be charged for it, even sitting exactly at the
  // limit.
  it("allows re-revealing a listing already counted inside the window, even at the limit", () => {
    const recent = Array.from(
      { length: REVEAL_RATE_LIMIT_MAX_DISTINCT_LISTINGS },
      (_, i) => `listing-${i}`,
    );

    expect(evaluateRevealAllowance(recent, "listing-0").allowed).toBe(true);
  });

  it("allows again once the window rolls and fewer than 40 remain", () => {
    const recent = Array.from(
      { length: REVEAL_RATE_LIMIT_MAX_DISTINCT_LISTINGS - 1 },
      (_, i) => `listing-${i}`,
    );

    expect(evaluateRevealAllowance(recent, "listing-new").allowed).toBe(true);
  });
});
