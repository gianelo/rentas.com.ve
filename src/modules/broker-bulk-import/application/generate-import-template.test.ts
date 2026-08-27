import { describe, expect, it, vi } from "vitest";
import type { CataloguePort } from "../../listing-catalogue/application/ports/catalogue.port";
import type { CatalogueCity, CatalogueZone } from "../../listing-catalogue/domain/catalogue";
import type { CuratedZone } from "../../listing-publication/domain/publishable-listing";
import { IMPORT_COLUMN_ALLOWLIST } from "../domain/csv-import-columns";
import type { ImportAccountContact } from "../domain/import-row-validation";
import { validateImportRows } from "../domain/import-row-validation";
import {
  applyResolvedLocations,
  mergeLocationResolutionErrors,
  resolveImportRowLocations,
} from "../domain/resolve-import-locations";
import { generateImportTemplate } from "./generate-import-template";
import { parseImportFile } from "./parse-import-file";
import type { ImportFileSourcePort } from "./ports/import-file-source.port";

/**
 * broker-bulk-import spec, "Downloadable Template as the Format Contract"
 * (tasks.md 9.25) — its second scenario, and the one built first per the
 * orchestrator's own ask: "Template is accepted when filled and
 * re-uploaded."
 *
 * **The round trip is the proof.** `generateImportTemplate` produces the
 * template; its example rows are then fed, byte for byte, through the REAL
 * `parseImportFile` (tasks.md 9.4-9.11, already shipped), the REAL
 * name-resolution layer (`resolve-import-locations.ts` — mvp-rental-
 * listings unplanned work unit, "bulk import: resolve ciudad and zona by
 * name"), and the REAL `validateImportRows` (tasks.md 9.12-9.15) — not a
 * re-implementation of any of the three. If the template and the parser
 * ever disagree about a column, if neutralisation ever corrupts a field's
 * CSV syntax, or if the template's own NAMES ever fail to resolve back to
 * the ids `validateImportRows` needs, this test is what turns red — nothing
 * here re-asserts the shape of any side in isolation.
 */

const CARACAS: CatalogueCity = { id: "city-dc-uuid", name: "Distrito Capital" };
const MARACAIBO: CatalogueCity = { id: "city-mcbo-uuid", name: "Maracaibo" };
const CITIES: readonly CatalogueCity[] = [CARACAS, MARACAIBO];

const ZONES: readonly CatalogueZone[] = [
  {
    id: "zone-chacao-uuid",
    name: "Chacao",
    cityId: CARACAS.id,
    kind: "municipio",
    category: null,
    parentName: null,
  },
  {
    id: "zone-lago-uuid",
    name: "La Lago",
    cityId: MARACAIBO.id,
    kind: "parroquia",
    category: null,
    parentName: null,
  },
];

const CURATED_ZONES: readonly CuratedZone[] = ZONES.map((zone) => ({
  id: zone.id,
  cityId: zone.cityId,
}));

const ACCOUNT_CONTACT: ImportAccountContact = {
  contactMethod: "whatsapp",
  contactValue: "+584121234567",
};

function fakeCatalogue(): CataloguePort {
  return {
    listCities: vi.fn(async () => [CARACAS, MARACAIBO]),
    listZones: vi.fn(async () => ZONES),
  };
}

function sourceFromText(text: string): ImportFileSourcePort {
  const bytes = new TextEncoder().encode(text);
  return {
    declaredByteLength: bytes.byteLength,
    async *chunks() {
      yield bytes;
    },
  };
}

describe("generateImportTemplate", () => {
  it("calls the catalogue for both cities and every zone exactly once", async () => {
    const catalogue = fakeCatalogue();
    await generateImportTemplate({ catalogue });

    expect(catalogue.listCities).toHaveBeenCalledTimes(1);
    expect(catalogue.listZones).toHaveBeenCalledTimes(1);
  });

  it("produces a CSV whose header row is exactly the allowlist's header, in order", async () => {
    const csv = await generateImportTemplate({ catalogue: fakeCatalogue() });
    const firstLine = csv.replace(/^﻿/, "").split("\n")[0];

    expect(firstLine).toBe(IMPORT_COLUMN_ALLOWLIST.map((column) => column.header).join(","));
  });
});

describe("generateImportTemplate — round trip through the REAL parser (tasks.md 9.25)", () => {
  it("parses back into exactly one row per city, carrying the real city/zone NAMES — never an id", async () => {
    const csv = await generateImportTemplate({ catalogue: fakeCatalogue() });

    const parsed = await parseImportFile(sourceFromText(csv));

    expect(parsed.rows).toHaveLength(2);
    const byCity = new Map(parsed.rows.map((row) => [row.city, row]));
    expect(byCity.get(CARACAS.name)?.zone).toBe("Chacao");
    expect(byCity.get(MARACAIBO.name)?.zone).toBe("La Lago");
  });

  it("does NOT dodge the trap: the example title survives its own neutralisation and parses as text", async () => {
    const csv = await generateImportTemplate({ catalogue: fakeCatalogue() });
    const parsed = await parseImportFile(sourceFromText(csv));

    const caracasRow = parsed.rows.find((row) => row.city === CARACAS.name);
    // Neutralised on write (leading '-' -> a leading apostrophe,
    // csv-output-writer.ts) and never stripped back out on read
    // (deliberately, per that file's own doc comment) — this is what
    // "survives its own neutralisation" means concretely: the ORIGINAL
    // text is still fully present and readable, just carrying one extra
    // leading byte.
    expect(caracasRow?.title).toBe("'-Amplio inmueble en Distrito Capital");
    expect(caracasRow?.title).toContain("Amplio inmueble en Distrito Capital");
  });

  // mvp-rental-listings unplanned work unit ("bulk import: resolve ciudad y
  // zona por nombre"): the template's own names must resolve back to real
  // ids through resolve-import-locations.ts, THEN pass the real per-row
  // validator — proving both halves of the contract at once, exactly the
  // way slice F proved the parser half alone.
  it("the example rows' NAMES resolve to real ids and are then ACCEPTED: zero validation errors end to end", async () => {
    const csv = await generateImportTemplate({ catalogue: fakeCatalogue() });
    const parsed = await parseImportFile(sourceFromText(csv));

    const locationOutcomes = resolveImportRowLocations(parsed.rows, CITIES, ZONES);
    expect(locationOutcomes.every((outcome) => outcome.errorMessages.length === 0)).toBe(true);

    const preparedRows = applyResolvedLocations(parsed.rows, locationOutcomes);
    // `parsed.rows` — las del archivo, con NOMBRES — es de donde salen las
    // celdas que 14g dibuja (tasks.md 9.29); las reglas siguen corriendo
    // sobre `preparedRows`, que ya trabajan en ids.
    const validationOutcome = validateImportRows(
      preparedRows,
      CURATED_ZONES,
      ACCOUNT_CONTACT,
      parsed.rows,
    );
    const outcome = mergeLocationResolutionErrors(validationOutcome, locationOutcomes, parsed.rows);

    expect(outcome.errors).toEqual([]);
    expect(outcome.validRows).toHaveLength(2);
    expect(outcome.validRows.map((row) => row.listing.cityId).sort()).toEqual(
      [CARACAS.id, MARACAIBO.id].sort(),
    );
  });
});
