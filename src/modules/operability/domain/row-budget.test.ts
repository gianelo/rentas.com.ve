import { describe, expect, it } from "vitest";
import { assertRowBudget, ROW_BUDGET, RowBudgetExceededError } from "./row-budget";

describe("assertRowBudget", () => {
  it("returns the same rows, unchanged, at exactly the 300-row ceiling", () => {
    const rows = Array.from({ length: ROW_BUDGET }, (_, index) => index);

    expect(assertRowBudget(rows, "test.atCeiling")).toBe(rows);
  });

  it("returns an empty result through without throwing", () => {
    expect(assertRowBudget([], "test.empty")).toEqual([]);
  });

  it("throws RowBudgetExceededError one row over the 300-row ceiling", () => {
    const rows = Array.from({ length: ROW_BUDGET + 1 }, (_, index) => index);

    expect(() => assertRowBudget(rows, "test.overCeiling")).toThrow(RowBudgetExceededError);
  });

  it("names the query and the exact row count in the message, so a breach is legible in a log", () => {
    const rows = Array.from({ length: 791 }, () => null);

    // 791 is not arbitrary: it is the smallest instance of the historical
    // leak (tasks.md 27.4, measurement paragraph — La Guaira). This is the
    // exact shape this guard exists to catch.
    expect(() => assertRowBudget(rows, "DrizzleCatalogue.listActiveZones")).toThrow(
      /DrizzleCatalogue\.listActiveZones.*791/s,
    );
  });

  it("mentions the 2026-09-07 incident, so a breach is legible to someone who was not there", () => {
    const rows = Array.from({ length: ROW_BUDGET + 1 }, () => null);

    expect(() => assertRowBudget(rows, "test.incident")).toThrow(/2026-09-07/);
  });
});
