import { describe, expect, it } from "vitest";
import { validateImportHeader } from "./csv-import-header";
import { mapImportRow, parseCsvRows } from "./csv-import-rows";

/**
 * broker-bulk-import spec, Requirement: Accepted CSV Structure +
 * Requirement: Encoding and Delimiter Tolerance (tasks.md 9.5/9.10/9.11).
 *
 * **Simplification, stated plainly rather than claimed away:** a field may
 * NOT contain a literal newline, even quoted. A row separator is always a
 * newline. This is what lets the streaming pre-parse row-count bound
 * (`read-bounded-import-file.ts`, counting `\n` bytes) and the actual parsed
 * row count agree exactly, with no divergence to reconcile — a portfolio
 * CSV's `titulo`/`descripcion` cells are single-line broker copy, not
 * multi-paragraph text, so this costs nothing real. A comma or semicolon
 * INSIDE a quoted field is fully supported.
 */

describe("parseCsvRows", () => {
  it("splits a simple comma-delimited file into rows and columns", () => {
    const text = "referencia_externa,titulo\nAB1,Apartamento en Chacao\nAB2,Casa en Baruta";
    expect(parseCsvRows(text, ",")).toEqual([
      ["referencia_externa", "titulo"],
      ["AB1", "Apartamento en Chacao"],
      ["AB2", "Casa en Baruta"],
    ]);
  });

  it("splits a semicolon-delimited file into CORRECT columns, not one column", () => {
    const text = "referencia_externa;titulo;precio_usd\nAB1;Apartamento;450";
    expect(parseCsvRows(text, ";")).toEqual([
      ["referencia_externa", "titulo", "precio_usd"],
      ["AB1", "Apartamento", "450"],
    ]);
  });

  it("keeps a delimiter that is inside a quoted field as part of that field's value", () => {
    const text = 'referencia_externa;titulo\nAB1;"Casa, moderna y amplia"';
    expect(parseCsvRows(text, ";")).toEqual([
      ["referencia_externa", "titulo"],
      ["AB1", "Casa, moderna y amplia"],
    ]);
  });

  it("un-escapes a doubled quote inside a quoted field", () => {
    const text = 'referencia_externa;titulo\nAB1;"Casa ""moderna"" en Chacao"';
    expect(parseCsvRows(text, ";")).toEqual([
      ["referencia_externa", "titulo"],
      ["AB1", 'Casa "moderna" en Chacao'],
    ]);
  });

  it("tolerates CRLF line endings from a Windows-exported spreadsheet", () => {
    const text = "referencia_externa;titulo\r\nAB1;Apartamento\r\nAB2;Casa";
    expect(parseCsvRows(text, ";")).toEqual([
      ["referencia_externa", "titulo"],
      ["AB1", "Apartamento"],
      ["AB2", "Casa"],
    ]);
  });

  it("drops a single trailing blank line left by a final newline", () => {
    const text = "referencia_externa;titulo\nAB1;Apartamento\n";
    expect(parseCsvRows(text, ";")).toEqual([
      ["referencia_externa", "titulo"],
      ["AB1", "Apartamento"],
    ]);
  });
});

describe("mapImportRow — strict allowlist (tasks.md 9.10/9.11)", () => {
  it("maps only the allowlisted columns, keyed by canonical field name", () => {
    const header = validateImportHeader([
      "referencia_externa",
      "titulo",
      "descripcion",
      "precio_usd",
      "ciudad",
      "zona",
    ]);
    expect(header.ok).toBe(true);
    if (!header.ok) return;

    const mapped = mapImportRow(header.columns, [
      "AB1",
      "Apartamento en Chacao",
      "Dos habitaciones",
      "450",
      "distrito-capital",
      "chacao",
    ]);

    expect(mapped).toEqual({
      externalReference: "AB1",
      title: "Apartamento en Chacao",
      description: "Dos habitaciones",
      priceUsd: "450",
      city: "distrito-capital",
      zone: "chacao",
    });
  });

  it("ignores publisher_type, status, expires_at, and user_id — never mapped, even if present", () => {
    const header = validateImportHeader([
      "referencia_externa",
      "titulo",
      "descripcion",
      "precio_usd",
      "ciudad",
      "zona",
      "publisher_type",
      "status",
      "expires_at",
      "user_id",
    ]);
    expect(header.ok).toBe(true);
    if (!header.ok) return;

    const mapped = mapImportRow(header.columns, [
      "AB1",
      "Apartamento",
      "Descripcion",
      "450",
      "distrito-capital",
      "chacao",
      "owner",
      "active",
      "2099-01-01",
      "some-other-user-id",
    ]);

    expect(mapped).toEqual({
      externalReference: "AB1",
      title: "Apartamento",
      description: "Descripcion",
      priceUsd: "450",
      city: "distrito-capital",
      zone: "chacao",
    });
    expect(Object.keys(mapped)).not.toContain("publisher_type");
    expect(Object.keys(mapped)).not.toContain("status");
  });

  it("maps optional columns when present", () => {
    const header = validateImportHeader([
      "referencia_externa",
      "titulo",
      "descripcion",
      "precio_usd",
      "ciudad",
      "zona",
      "tipo_inmueble",
      "planta_electrica",
    ]);
    expect(header.ok).toBe(true);
    if (!header.ok) return;

    const mapped = mapImportRow(header.columns, [
      "AB1",
      "Apartamento",
      "Descripcion",
      "450",
      "distrito-capital",
      "chacao",
      "apartamento",
      "si",
    ]);

    expect(mapped.propertyType).toBe("apartamento");
    expect(mapped.hasPowerPlant).toBe("si");
  });

  it("trims whitespace around each mapped cell value", () => {
    const header = validateImportHeader([
      "referencia_externa",
      "titulo",
      "descripcion",
      "precio_usd",
      "ciudad",
      "zona",
    ]);
    expect(header.ok).toBe(true);
    if (!header.ok) return;

    const mapped = mapImportRow(header.columns, [
      "  AB1  ",
      " Apartamento ",
      "Descripcion",
      " 450 ",
      "distrito-capital",
      "chacao",
    ]);

    expect(mapped.externalReference).toBe("AB1");
    expect(mapped.priceUsd).toBe("450");
  });

  it("maps an absent optional column's cell as an empty string when the row is shorter than the header", () => {
    const header = validateImportHeader([
      "referencia_externa",
      "titulo",
      "descripcion",
      "precio_usd",
      "ciudad",
      "zona",
      "tipo_inmueble",
    ]);
    expect(header.ok).toBe(true);
    if (!header.ok) return;

    const mapped = mapImportRow(header.columns, [
      "AB1",
      "Apartamento",
      "Descripcion",
      "450",
      "distrito-capital",
      "chacao",
      // tipo_inmueble column present in header, missing from this row
    ]);

    expect(mapped.propertyType).toBe("");
  });
});
