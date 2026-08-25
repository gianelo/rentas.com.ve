import { describe, expect, it } from "vitest";
import type { CatalogueCity, CatalogueZone } from "../../listing-catalogue/domain/catalogue";
import { buildImportTemplateRows, IMPORT_TEMPLATE_HEADER } from "./build-import-template-rows";
import { IMPORT_COLUMN_ALLOWLIST } from "./csv-import-columns";

/**
 * broker-bulk-import spec, "Downloadable Template as the Format Contract"
 * (tasks.md 9.25). **Reads `IMPORT_COLUMN_ALLOWLIST` — the ONE source the
 * parser also reads (tasks.md 9.11) — rather than restating the column
 * list.** That is what makes the spec's "Template matches the parser"
 * scenario true by construction: change a column in the allowlist and this
 * module's header changes with it, because there is only one array.
 */

const CARACAS: CatalogueCity = { id: "city-dc-uuid", name: "Distrito Capital" };
const MARACAIBO: CatalogueCity = { id: "city-mcbo-uuid", name: "Maracaibo" };

const ZONES: readonly CatalogueZone[] = [
  { id: "zone-chacao-uuid", name: "Chacao", cityId: CARACAS.id },
  { id: "zone-lpg-uuid", name: "Los Palos Grandes", cityId: CARACAS.id },
  { id: "zone-lago-uuid", name: "La Lago", cityId: MARACAIBO.id },
];

describe("IMPORT_TEMPLATE_HEADER", () => {
  it("is the allowlist's own header list, in the allowlist's own order — not a restated copy", () => {
    expect(IMPORT_TEMPLATE_HEADER).toEqual(IMPORT_COLUMN_ALLOWLIST.map((column) => column.header));
  });
});

describe("buildImportTemplateRows — one example row per city", () => {
  it("builds exactly one row per city that has a curated zone", () => {
    const rows = buildImportTemplateRows([CARACAS, MARACAIBO], ZONES);
    expect(rows).toHaveLength(2);
  });

  it("every row has exactly as many cells as the header has columns", () => {
    const rows = buildImportTemplateRows([CARACAS, MARACAIBO], ZONES);
    for (const row of rows) {
      expect(row).toHaveLength(IMPORT_TEMPLATE_HEADER.length);
    }
  });

  it("uses the city's REAL id in the ciudad column and one of ITS OWN zones' real id in the zona column", () => {
    const rows = buildImportTemplateRows([CARACAS, MARACAIBO], ZONES);
    const cityIndex = IMPORT_TEMPLATE_HEADER.indexOf("ciudad");
    const zoneIndex = IMPORT_TEMPLATE_HEADER.indexOf("zona");

    const caracasRow = rows.find((row) => row[cityIndex] === CARACAS.id);
    expect(caracasRow).toBeDefined();
    expect(caracasRow?.[zoneIndex]).toBe("zone-chacao-uuid");

    const maracaiboRow = rows.find((row) => row[cityIndex] === MARACAIBO.id);
    expect(maracaiboRow).toBeDefined();
    expect(maracaiboRow?.[zoneIndex]).toBe("zone-lago-uuid");
  });

  it("skips a city with no curated zone — a row certain to fail the zone check is worse than no row", () => {
    const cityWithoutZones: CatalogueCity = { id: "city-empty", name: "Sin zonas" };
    const rows = buildImportTemplateRows([cityWithoutZones], ZONES);
    expect(rows).toHaveLength(0);
  });

  it("gives every row a distinct, non-blank referencia_externa", () => {
    const rows = buildImportTemplateRows([CARACAS, MARACAIBO], ZONES);
    const refIndex = IMPORT_TEMPLATE_HEADER.indexOf("referencia_externa");
    const refs = rows.map((row) => row[refIndex] ?? "");
    expect(refs.every((ref) => ref.trim() !== "")).toBe(true);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("does NOT dodge the formula-injection trap: the example titulo legitimately begins with '-'", () => {
    const rows = buildImportTemplateRows([CARACAS], ZONES);
    const titleIndex = IMPORT_TEMPLATE_HEADER.indexOf("titulo");
    expect(rows[0]?.[titleIndex]?.startsWith("-")).toBe(true);
  });

  it("writes a descripcion long enough to satisfy the publish flow's own minimum (120 characters)", () => {
    const rows = buildImportTemplateRows([CARACAS], ZONES);
    const descriptionIndex = IMPORT_TEMPLATE_HEADER.indexOf("descripcion");
    const description = rows[0]?.[descriptionIndex] ?? "";
    expect([...description].length).toBeGreaterThanOrEqual(120);
  });
});
