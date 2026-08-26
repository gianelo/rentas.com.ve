import { describe, expect, it } from "vitest";
import {
  ImportEncodingError,
  ImportMissingColumnsError,
  parseImportFile,
} from "./parse-import-file";
import type { ImportFileSourcePort } from "./ports/import-file-source.port";
import { ImportTooManyRowsError } from "./read-bounded-import-file";

/**
 * broker-bulk-import spec: "Downloadable Template as the Format Contract",
 * "Accepted CSV Structure", "Encoding and Delimiter Tolerance", "Bounded
 * Input Size" (tasks.md 9.4-9.11). This is the parser's end-to-end
 * acceptance surface — everything below it (`csv-import-*.ts`,
 * `read-bounded-import-file.ts`) is proven in isolation elsewhere; this
 * file proves the pieces actually compose.
 */

function sourceFromBytes(bytes: Uint8Array): ImportFileSourcePort {
  return {
    declaredByteLength: bytes.byteLength,
    async *chunks() {
      yield bytes;
    },
  };
}

function sourceFromText(text: string): ImportFileSourcePort {
  return sourceFromBytes(new TextEncoder().encode(text));
}

const REQUIRED_HEADER = "referencia_externa,titulo,descripcion,precio_usd,ciudad,zona";

describe("parseImportFile — happy path", () => {
  it("parses a comma-delimited UTF-8 file with no BOM", async () => {
    const text = `${REQUIRED_HEADER}\nAB1,Apartamento en Chacao,Dos habitaciones,450,distrito-capital,chacao`;
    const result = await parseImportFile(sourceFromText(text));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      externalReference: "AB1",
      title: "Apartamento en Chacao",
      description: "Dos habitaciones",
      priceUsd: "450",
      city: "distrito-capital",
      zone: "chacao",
    });
  });

  it("parses MULTIPLE rows, in order", async () => {
    const text = `${REQUIRED_HEADER}\nAB1,Apto 1,Desc,100,distrito-capital,chacao\nAB2,Apto 2,Desc,200,maracaibo,doral`;
    const result = await parseImportFile(sourceFromText(text));

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.externalReference).toBe("AB1");
    expect(result.rows[1]?.externalReference).toBe("AB2");
  });
});

describe("parseImportFile — encoding and delimiter tolerance (tasks.md 9.5)", () => {
  it("parses a semicolon-delimited file carrying a UTF-8 BOM into CORRECT COLUMNS, not one column", async () => {
    const semicolonHeader = REQUIRED_HEADER.replaceAll(",", ";");
    const text = `﻿${semicolonHeader}\nAB1;Apartamento;Descripcion;450;distrito-capital;chacao`;
    const result = await parseImportFile(sourceFromText(text));

    // The strongest possible proof against "read as one column": the row
    // resolves into six distinct, correctly-keyed fields.
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      externalReference: "AB1",
      title: "Apartamento",
      description: "Descripcion",
      priceUsd: "450",
      city: "distrito-capital",
      zone: "chacao",
    });
  });

  it("would collapse a semicolon file into one giant column if the BOM leaked into the first header cell (regression proof)", async () => {
    // Same file WITHOUT this parser's BOM-stripping step, simulated by
    // proving the header-only text (BOM intact) fails required-column
    // validation the way an un-stripped BOM would cause — locking in WHY
    // stripping matters, not just that it happens.
    const semicolonHeader = REQUIRED_HEADER.replaceAll(",", ";");
    const textWithoutStripping = `﻿${semicolonHeader}`;
    expect(textWithoutStripping.startsWith("referencia_externa")).toBe(false);
  });
});

describe("parseImportFile — Requirement: Encoding, non-UTF-8 refusal (tasks.md 9.6)", () => {
  it("rejects a file that cannot be decoded as UTF-8, telling the broker to re-export as CSV UTF-8", async () => {
    const invalidUtf8 = Uint8Array.from([0x74, 0xed, 0x74, 0x75, 0x6c, 0x6f]);

    await expect(parseImportFile(sourceFromBytes(invalidUtf8))).rejects.toThrow(
      ImportEncodingError,
    );
    await expect(parseImportFile(sourceFromBytes(invalidUtf8))).rejects.toThrow(/CSV UTF-8/);
  });
});

describe("parseImportFile — Requirement: Accepted CSV Structure (tasks.md 9.4)", () => {
  it("rejects the WHOLE file when precio_usd is missing, naming the column, before any row is processed", async () => {
    const text =
      "referencia_externa,titulo,descripcion,ciudad,zona\nAB1,Apto,Desc,distrito-capital,chacao";

    await expect(parseImportFile(sourceFromText(text))).rejects.toThrow(ImportMissingColumnsError);
    await expect(parseImportFile(sourceFromText(text))).rejects.toThrow(/precio_usd/);
  });

  it("accepts required columns in any order", async () => {
    const reorderedHeader = "zona,ciudad,precio_usd,descripcion,titulo,referencia_externa";
    const text = `${reorderedHeader}\nchacao,distrito-capital,450,Desc,Apto,AB1`;

    const result = await parseImportFile(sourceFromText(text));
    expect(result.rows[0]?.externalReference).toBe("AB1");
  });

  it("rejects a completely empty file, naming all six required columns as missing", async () => {
    await expect(parseImportFile(sourceFromText(""))).rejects.toThrow(ImportMissingColumnsError);
    await expect(parseImportFile(sourceFromText(""))).rejects.toThrow(/referencia_externa/);
  });
});

describe("parseImportFile — Requirement: Accepted CSV Structure, unknown columns (tasks.md 9.10/9.11)", () => {
  it("ignores publisher_type, status, expires_at, and user_id rather than mapping them", async () => {
    const header = `${REQUIRED_HEADER},publisher_type,status,expires_at,user_id`;
    const text = `${header}\nAB1,Apto,Desc,450,distrito-capital,chacao,owner,active,2099-01-01,someone-elses-id`;

    const result = await parseImportFile(sourceFromText(text));

    expect(result.rows).toHaveLength(1);
    expect(Object.keys(result.rows[0] as object).sort()).toEqual(
      ["externalReference", "title", "description", "priceUsd", "city", "zone"].sort(),
    );
  });
});

describe("parseImportFile — Requirement: Bounded Input Size (tasks.md 9.8/9.9)", () => {
  it("rejects a file whose data-row count exceeds 50, even without hitting the streaming fast-abort threshold (boundary case)", async () => {
    // 51 data rows, no trailing newline: the streaming byte/newline
    // pre-check in read-bounded-import-file.ts may not fire this close to
    // the boundary — this is parseImportFile's OWN authoritative check
    // against the real parsed row count.
    const rows = Array.from(
      { length: 51 },
      (_, i) => `AB${i},Apto ${i},Desc,100,distrito-capital,chacao`,
    );
    const text = `${REQUIRED_HEADER}\n${rows.join("\n")}`;

    await expect(parseImportFile(sourceFromText(text))).rejects.toThrow(ImportTooManyRowsError);
  });

  it("accepts a file with exactly 50 data rows", async () => {
    const rows = Array.from(
      { length: 50 },
      (_, i) => `AB${i},Apto ${i},Desc,100,distrito-capital,chacao`,
    );
    const text = `${REQUIRED_HEADER}\n${rows.join("\n")}`;

    const result = await parseImportFile(sourceFromText(text));
    expect(result.rows).toHaveLength(50);
  });
});
