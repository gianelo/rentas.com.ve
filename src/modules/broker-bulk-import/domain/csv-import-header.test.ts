import { describe, expect, it } from "vitest";
import { validateImportHeader } from "./csv-import-header";

/**
 * broker-bulk-import spec, Requirement: Accepted CSV Structure, scenario
 * "Missing required column is rejected before any row is processed"
 * (tasks.md 9.4). "The system MUST require a header row and MUST accept
 * columns in any order."
 */

describe("validateImportHeader", () => {
  it("accepts a header carrying exactly the six required columns", () => {
    const result = validateImportHeader([
      "referencia_externa",
      "titulo",
      "descripcion",
      "precio_usd",
      "ciudad",
      "zona",
    ]);
    expect(result.ok).toBe(true);
  });

  it("accepts required columns in ANY order — order must not matter", () => {
    const result = validateImportHeader([
      "zona",
      "ciudad",
      "precio_usd",
      "descripcion",
      "titulo",
      "referencia_externa",
    ]);
    expect(result.ok).toBe(true);
  });

  it("accepts optional columns mixed in, in any position", () => {
    const result = validateImportHeader([
      "tipo_inmueble",
      "referencia_externa",
      "titulo",
      "planta_electrica",
      "descripcion",
      "precio_usd",
      "ciudad",
      "zona",
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects the WHOLE file when precio_usd is missing, naming the column", () => {
    const result = validateImportHeader([
      "referencia_externa",
      "titulo",
      "descripcion",
      "ciudad",
      "zona",
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingColumns).toEqual(["precio_usd"]);
    }
  });

  it("reports every missing column, not just the first", () => {
    const result = validateImportHeader(["titulo", "descripcion"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingColumns).toEqual(["referencia_externa", "precio_usd", "ciudad", "zona"]);
    }
  });

  it("resolves a column-index map by canonical field name when the header is valid", () => {
    const result = validateImportHeader([
      "ciudad",
      "referencia_externa",
      "titulo",
      "descripcion",
      "precio_usd",
      "zona",
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.columns.columnIndexByField.get("city")).toBe(0);
      expect(result.columns.columnIndexByField.get("externalReference")).toBe(1);
      expect(result.columns.columnIndexByField.get("priceUsd")).toBe(4);
    }
  });

  it("drops an unrecognised column from the resolved index map rather than mapping it", () => {
    const result = validateImportHeader([
      "referencia_externa",
      "titulo",
      "descripcion",
      "precio_usd",
      "ciudad",
      "zona",
      "publisher_type",
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.columns.columnIndexByField.has("publisher_type")).toBe(false);
      expect(result.columns.columnIndexByField.size).toBe(6);
    }
  });

  it("matches header names case-insensitively and trims stray whitespace", () => {
    const result = validateImportHeader([
      " Referencia_Externa ",
      "TITULO",
      "descripcion",
      "PRECIO_USD",
      "ciudad",
      "zona",
    ]);
    expect(result.ok).toBe(true);
  });
});
