import { describe, expect, it } from "vitest";
import {
  IMPORT_BOOLEAN_COLUMNS,
  IMPORT_BOOLEAN_FALSE_VALUES,
  IMPORT_BOOLEAN_TRUE_VALUES,
  IMPORT_COLUMN_ALLOWLIST,
  REQUIRED_IMPORT_COLUMNS,
} from "./csv-import-columns";

/**
 * broker-bulk-import spec, Requirement: Accepted CSV Structure + Requirement:
 * Downloadable Template as the Format Contract (tasks.md 9.4/9.10/9.11).
 *
 * This allowlist is the ONE source both the parser (this slice) and the
 * template generator (tasks.md 9.25, not built yet) read from. Founder
 * decision, not the spec's original 6: the operator asked for every column
 * the schema can actually store — 6 required (the spec's own list) plus 10
 * optional, all confirmed present on `listing`.
 */

describe("IMPORT_COLUMN_ALLOWLIST", () => {
  it("has exactly 16 columns: the spec's 6 required plus the founder's 10 optional", () => {
    expect(IMPORT_COLUMN_ALLOWLIST).toHaveLength(16);
  });

  it("required columns are exactly the spec's six, in the spec's own header names", () => {
    expect(REQUIRED_IMPORT_COLUMNS).toEqual([
      "referencia_externa",
      "titulo",
      "descripcion",
      "precio_usd",
      "ciudad",
      "zona",
    ]);
  });

  it("maps every required header to a canonical field name used elsewhere in the codebase", () => {
    const byHeader = new Map(IMPORT_COLUMN_ALLOWLIST.map((c) => [c.header, c]));
    expect(byHeader.get("referencia_externa")).toMatchObject({
      field: "externalReference",
      required: true,
    });
    expect(byHeader.get("precio_usd")).toMatchObject({ field: "priceUsd", required: true });
  });

  it("maps every optional header from the founder's list to its schema field name", () => {
    const byHeader = new Map(IMPORT_COLUMN_ALLOWLIST.map((c) => [c.header, c]));
    expect(byHeader.get("tipo_inmueble")).toMatchObject({
      field: "propertyType",
      required: false,
    });
    expect(byHeader.get("habitaciones")).toMatchObject({ field: "rooms", required: false });
    expect(byHeader.get("banos")).toMatchObject({ field: "bathrooms", required: false });
    expect(byHeader.get("metros2")).toMatchObject({ field: "areaM2", required: false });
    expect(byHeader.get("estacionamientos")).toMatchObject({
      field: "parkingSpots",
      required: false,
    });
    expect(byHeader.get("planta_electrica")).toMatchObject({
      field: "hasPowerPlant",
      required: false,
    });
    expect(byHeader.get("agua_regular")).toMatchObject({
      field: "hasRegularWater",
      required: false,
    });
    expect(byHeader.get("amoblado")).toMatchObject({ field: "isFurnished", required: false });
    expect(byHeader.get("vigilancia")).toMatchObject({ field: "hasSecurity", required: false });
    expect(byHeader.get("linea_blanca")).toMatchObject({
      field: "hasAppliances",
      required: false,
    });
  });

  it("has no duplicate header names and no duplicate field names", () => {
    const headers = IMPORT_COLUMN_ALLOWLIST.map((c) => c.header);
    const fields = IMPORT_COLUMN_ALLOWLIST.map((c) => c.field);
    expect(new Set(headers).size).toBe(headers.length);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("does NOT accept contact columns — contact comes from the account default, never the file", () => {
    const headers = IMPORT_COLUMN_ALLOWLIST.map((c) => c.header);
    expect(headers).not.toContain("contact_method");
    expect(headers).not.toContain("contact_value");
  });
});

describe("IMPORT_BOOLEAN_COLUMNS", () => {
  it("is exactly the five F6 attributes a broker would otherwise re-type fifty times", () => {
    expect(IMPORT_BOOLEAN_COLUMNS).toEqual(
      new Set(["planta_electrica", "agua_regular", "amoblado", "vigilancia", "linea_blanca"]),
    );
  });
});

describe("boolean cell vocabulary (founder decision, documented here)", () => {
  it("accepts si/no as the primary Spanish-locale spreadsheet vocabulary", () => {
    expect(IMPORT_BOOLEAN_TRUE_VALUES).toContain("si");
    expect(IMPORT_BOOLEAN_FALSE_VALUES).toContain("no");
  });

  it("also accepts 1/0, since a spreadsheet in a Spanish locale will not write `true`", () => {
    expect(IMPORT_BOOLEAN_TRUE_VALUES).toContain("1");
    expect(IMPORT_BOOLEAN_FALSE_VALUES).toContain("0");
  });
});
