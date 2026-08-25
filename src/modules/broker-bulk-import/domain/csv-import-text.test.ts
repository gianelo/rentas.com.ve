import { describe, expect, it } from "vitest";
import { sniffDelimiter, stripBom, UTF8_BOM } from "./csv-import-text";

/**
 * broker-bulk-import spec, Requirement: Encoding and Delimiter Tolerance
 * (tasks.md 9.5). "A BOM is invisible" — without stripping it, the first
 * column name silently becomes `﻿referencia_externa` and the file is
 * rejected for a missing column that is right there.
 */

describe("stripBom", () => {
  it("removes a leading UTF-8 BOM", () => {
    expect(stripBom(`${UTF8_BOM}referencia_externa;titulo`)).toBe("referencia_externa;titulo");
  });

  it("leaves text without a BOM unchanged", () => {
    expect(stripBom("referencia_externa;titulo")).toBe("referencia_externa;titulo");
  });

  it("only strips a BOM at the very start, not one buried in the text", () => {
    const withBomInMiddle = `referencia_externa;titulo${UTF8_BOM}`;
    expect(stripBom(withBomInMiddle)).toBe(withBomInMiddle);
  });
});

describe("sniffDelimiter", () => {
  it("detects comma when commas outnumber semicolons in the header line", () => {
    expect(sniffDelimiter("referencia_externa,titulo,descripcion")).toBe(",");
  });

  it("detects semicolon — the ordinary export from a Spanish-locale spreadsheet", () => {
    expect(sniffDelimiter("referencia_externa;titulo;descripcion")).toBe(";");
  });

  it("does not count delimiters that fall inside quoted fields", () => {
    // A header would not normally quote a column name, but a title column
    // whose sniffed line came from a data row (defensive case) must not let
    // a comma inside quotes tip the count.
    expect(sniffDelimiter('"Casa, moderna";precio_usd;zona')).toBe(";");
  });

  it("falls back to comma when the line carries neither delimiter", () => {
    expect(sniffDelimiter("solo_una_columna")).toBe(",");
  });
});
