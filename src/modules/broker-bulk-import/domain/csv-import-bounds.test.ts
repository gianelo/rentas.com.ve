import { describe, expect, it } from "vitest";
import {
  checkFileSizeBound,
  checkRowCountBound,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_ROW_COUNT,
} from "./csv-import-bounds";

/**
 * broker-bulk-import spec, Requirement: Bounded Input Size (tasks.md
 * 9.8/9.9). Founder decisions: 50 rows, 2 MB, both enforced before the file
 * is parsed. Pure and I/O-free on purpose: the caller (application layer)
 * supplies numbers it already knows from streaming (bytes read so far,
 * lines seen so far) — this file never reads a byte itself.
 */

describe("MAX_IMPORT_FILE_SIZE_BYTES / MAX_IMPORT_ROW_COUNT", () => {
  it("is the founder's 2 MB / 50 rows, not a placeholder", () => {
    expect(MAX_IMPORT_FILE_SIZE_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_IMPORT_ROW_COUNT).toBe(50);
  });
});

describe("checkFileSizeBound", () => {
  it("allows a file at or under the limit", () => {
    expect(checkFileSizeBound(MAX_IMPORT_FILE_SIZE_BYTES)).toBeNull();
    expect(checkFileSizeBound(100)).toBeNull();
  });

  it("refuses a file over the limit and names the limit in the violation", () => {
    const violation = checkFileSizeBound(MAX_IMPORT_FILE_SIZE_BYTES + 1);
    expect(violation).toEqual({ kind: "fileTooLarge", maxBytes: MAX_IMPORT_FILE_SIZE_BYTES });
  });

  it("refuses a grossly oversized file the same way (a 40 MB upload)", () => {
    const violation = checkFileSizeBound(40 * 1024 * 1024);
    expect(violation).toEqual({ kind: "fileTooLarge", maxBytes: MAX_IMPORT_FILE_SIZE_BYTES });
  });
});

describe("checkRowCountBound", () => {
  it("allows a row count at or under the limit", () => {
    expect(checkRowCountBound(MAX_IMPORT_ROW_COUNT)).toBeNull();
    expect(checkRowCountBound(1)).toBeNull();
  });

  it("refuses a row count over the limit and names the limit in the violation", () => {
    const violation = checkRowCountBound(MAX_IMPORT_ROW_COUNT + 1);
    expect(violation).toEqual({ kind: "tooManyRows", maxRows: MAX_IMPORT_ROW_COUNT });
  });

  it("refuses an 80-row portfolio (the exact scenario the limit exists for)", () => {
    const violation = checkRowCountBound(80);
    expect(violation).toEqual({ kind: "tooManyRows", maxRows: MAX_IMPORT_ROW_COUNT });
  });
});
