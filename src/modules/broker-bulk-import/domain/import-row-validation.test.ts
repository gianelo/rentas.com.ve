import { describe, expect, it } from "vitest";
import type { CuratedZone } from "../../listing-publication/domain/publishable-listing";
import type { ImportRow } from "./csv-import-rows";
import { type ImportAccountContact, validateImportRows } from "./import-row-validation";

/**
 * broker-bulk-import spec, "Whole-File Validation Before Any Write" +
 * "Preview and Confirmation with Per-Row Errors" + "Idempotent Import by
 * External Reference" (tasks.md 9.12/9.13/9.16).
 *
 * Every rule this file does NOT re-check (price, curated zone, room count,
 * ...) is already proven against `validatePublishableListing` in
 * `publishable-listing.test.ts` — this file proves REUSE, not a second copy
 * of the rule. What is genuinely new here: `referencia_externa` (not a
 * `listing` column, so `validatePublishableListing` has no opinion on it),
 * the boolean-cell vocabulary wired in, and row numbers.
 */

const CAPITAL = "distrito-capital";
const MARACAIBO = "maracaibo";

const ZONES: readonly CuratedZone[] = [
  { id: "chacao", cityId: CAPITAL },
  { id: "doral", cityId: MARACAIBO },
];

const CONTACT: ImportAccountContact = { contactMethod: "whatsapp", contactValue: "04121234567" };

const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

function validRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    externalReference: "REF-1",
    title: "Apartamento en Chacao",
    description: VALID_DESCRIPTION,
    priceUsd: "450",
    city: CAPITAL,
    zone: "chacao",
    propertyType: "apartamento",
    rooms: "2",
    bathrooms: "2",
    areaM2: "78",
    parkingSpots: "1",
    ...overrides,
  };
}

describe("validateImportRows — reuses validatePublishableListing for every rule it owns", () => {
  it("accepts a row that satisfies every rule, as a valid draft with no photo requirement", () => {
    const { validRows, errors } = validateImportRows([validRow()], ZONES, CONTACT);

    expect(errors).toEqual([]);
    expect(validRows).toHaveLength(1);
    expect(validRows[0]?.externalReference).toBe("REF-1");
    expect(validRows[0]?.rowNumber).toBe(2);
    expect(validRows[0]?.listing.contactMethod).toBe("whatsapp");
    expect(validRows[0]?.listing.contactValue).toBe("04121234567");
  });

  // tasks.md 9.12: "a row whose zone is not curated for its city is rejected
  // by the same rule the single-listing flow applies" — this is
  // `validatePublishableListing`'s own `zoneId.notInCity`, reused verbatim.
  it("rejects a row whose zone is not curated for its city, via the SAME rule the single-listing flow applies", () => {
    const { validRows, errors } = validateImportRows(
      [validRow({ city: CAPITAL, zone: "doral" })],
      ZONES,
      CONTACT,
    );

    expect(validRows).toEqual([]);
    expect(errors).toEqual([
      { rowNumber: 2, reasons: expect.arrayContaining(["zoneId.notInCity"]) },
    ]);
  });

  it("rejects a row whose city has no curated zone at all", () => {
    const { errors } = validateImportRows(
      [validRow({ city: "valencia", zone: "naguanagua" })],
      ZONES,
      CONTACT,
    );

    expect(errors[0]?.reasons).toContain("cityId.unknown");
  });

  it("never rejects a draft row for having no photos — that is an activation rule, not a draft one", () => {
    const { validRows, errors } = validateImportRows([validRow()], ZONES, CONTACT);

    expect(errors).toEqual([]);
    expect(validRows).toHaveLength(1);
  });

  // tasks.md 9.13: row numbers count the DATA rows a broker would see when
  // opening the file in a spreadsheet — the header is row 1.
  it("reports row numbers starting at 2 (the header is row 1)", () => {
    const rows = [validRow({ externalReference: "OK-1" }), validRow({ externalReference: "" })];

    const { errors } = validateImportRows(rows, ZONES, CONTACT);

    expect(errors).toEqual([{ rowNumber: 3, reasons: ["externalReference.required"] }]);
  });

  it("reports a blank external reference as required", () => {
    const { errors } = validateImportRows([validRow({ externalReference: "" })], ZONES, CONTACT);

    expect(errors).toEqual([{ rowNumber: 2, reasons: ["externalReference.required"] }]);
  });

  // tasks.md 9.16: "an uploaded file containing the same referencia_externa
  // on two rows... both rows are reported as invalid and no draft is
  // created for either" — purely in-memory, no database round trip.
  it("rejects BOTH rows when referencia_externa is duplicated within the same file", () => {
    const rows = [
      validRow({ externalReference: "DUP-1", title: "Primero" }),
      validRow({ externalReference: "DUP-1", title: "Segundo" }),
    ];

    const { validRows, errors } = validateImportRows(rows, ZONES, CONTACT);

    expect(validRows).toEqual([]);
    expect(errors).toEqual([
      { rowNumber: 2, reasons: ["externalReference.duplicateInFile"] },
      { rowNumber: 3, reasons: ["externalReference.duplicateInFile"] },
    ]);
  });

  it("does not treat two blank external references as duplicates of each other", () => {
    const rows = [validRow({ externalReference: "" }), validRow({ externalReference: "" })];

    const { errors } = validateImportRows(rows, ZONES, CONTACT);

    expect(errors).toEqual([
      { rowNumber: 2, reasons: ["externalReference.required"] },
      { rowNumber: 3, reasons: ["externalReference.required"] },
    ]);
  });

  it("reports 38 valid rows and 2 invalid rows with their row numbers and reasons", () => {
    const validOnes = Array.from({ length: 38 }, (_, i) =>
      validRow({ externalReference: `OK-${i}` }),
    );
    const invalidOnes = [
      validRow({ externalReference: "BAD-PRICE", priceUsd: "not-a-number" }),
      validRow({ externalReference: "BAD-ZONE", city: CAPITAL, zone: "doral" }),
    ];

    const { validRows, errors } = validateImportRows(
      [...validOnes, ...invalidOnes],
      ZONES,
      CONTACT,
    );

    expect(validRows).toHaveLength(38);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      rowNumber: 40,
      reasons: expect.arrayContaining(["priceUsd.invalid"]),
    });
    expect(errors[1]).toEqual({
      rowNumber: 41,
      reasons: expect.arrayContaining(["zoneId.notInCity"]),
    });
  });

  describe("boolean cells (planta_electrica, agua_regular, amoblado, vigilancia, linea_blanca)", () => {
    it("parses a valid si/no cell into the row's typed listing", () => {
      const { validRows } = validateImportRows(
        [validRow({ hasPowerPlant: "si", hasSecurity: "no" })],
        ZONES,
        CONTACT,
      );

      expect(validRows[0]?.listing.hasPowerPlant).toBe(true);
      expect(validRows[0]?.listing.hasSecurity).toBe(false);
    });

    it("leaves an unspecified boolean cell undefined, never coerced to false", () => {
      const { validRows } = validateImportRows([validRow()], ZONES, CONTACT);

      expect(validRows[0]?.listing.hasPowerPlant).toBeUndefined();
    });

    it("reports an unrecognised boolean cell as a row-level error, never a silent coercion to false", () => {
      const { errors, validRows } = validateImportRows(
        [validRow({ hasPowerPlant: "tal vez" })],
        ZONES,
        CONTACT,
      );

      expect(validRows).toEqual([]);
      expect(errors).toEqual([{ rowNumber: 2, reasons: ["hasPowerPlant.invalid"] }]);
    });
  });
});
