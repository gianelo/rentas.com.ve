import { describe, expect, it } from "vitest";
import { parseImportBooleanCell } from "./csv-import-boolean-cell";

/**
 * Founder decision documented in `csv-import-columns.ts`: a boolean cell in
 * the F6-attribute columns is `si`/`no`, with `1`/`0` also accepted. This
 * file is that contract as executable, reusable logic — the future per-row
 * validator (tasks.md 9.15) calls this instead of re-deciding the
 * vocabulary per column.
 */

describe("parseImportBooleanCell", () => {
  it("parses 'si' as true", () => {
    expect(parseImportBooleanCell("si")).toEqual({ ok: true, value: true });
  });

  it("parses 'no' as false", () => {
    expect(parseImportBooleanCell("no")).toEqual({ ok: true, value: false });
  });

  it("parses '1' as true and '0' as false", () => {
    expect(parseImportBooleanCell("1")).toEqual({ ok: true, value: true });
    expect(parseImportBooleanCell("0")).toEqual({ ok: true, value: false });
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(parseImportBooleanCell(" SI ")).toEqual({ ok: true, value: true });
    expect(parseImportBooleanCell("No")).toEqual({ ok: true, value: false });
  });

  it("treats an empty cell as 'not specified', not as false", () => {
    expect(parseImportBooleanCell("")).toEqual({ ok: true, value: undefined });
    expect(parseImportBooleanCell("   ")).toEqual({ ok: true, value: undefined });
  });

  it("rejects a value outside the vocabulary rather than guessing", () => {
    expect(parseImportBooleanCell("true")).toEqual({ ok: false });
    expect(parseImportBooleanCell("yes")).toEqual({ ok: false });
    expect(parseImportBooleanCell("tal vez")).toEqual({ ok: false });
  });
});
