import { describe, expect, it } from "vitest";
import type { CatalogueCity, CatalogueZone } from "../../listing-catalogue/domain/catalogue";
import type { ImportRow } from "./csv-import-rows";
import { importRowCells, offendingCellsFor } from "./import-row-cells";
import type { ImportRowError, ImportRowValidationOutcome } from "./import-row-validation";
import {
  applyResolvedLocations,
  mergeLocationResolutionErrors,
  resolveImportRowLocation,
  resolveImportRowLocations,
} from "./resolve-import-locations";

/**
 * The gap slice C's own docs flagged and deferred: "`ciudad`/`zona` cells
 * are treated as the same identifiers `CuratedZone` already uses; no
 * name→id resolution layer built". This is that layer — resolution runs
 * BEFORE `validatePublishableListing` ever sees the row, which keeps
 * everything past this point (`import-row-validation.ts`, `confirmImport`)
 * working in ids, unchanged.
 */

const CARACAS: CatalogueCity = { id: "city-dc", name: "Distrito Capital" };
const MARACAIBO: CatalogueCity = { id: "city-mcbo", name: "Maracaibo" };
const CITIES: readonly CatalogueCity[] = [CARACAS, MARACAIBO];

// «Chacao» is BOTH a municipio and a parroquia inside Distrito Capital —
// `schema.ts`'s own comment on `zone.parentId` states this real-data fact.
// Two rows, same normalized name, same city: a genuine ambiguity, not a
// contrived one.
const CHACAO_MUNICIPIO: CatalogueZone = {
  id: "zone-chacao-municipio",
  name: "Chacao",
  cityId: CARACAS.id,
  kind: "municipio",
  category: null,
  parentName: null,
};
const CHACAO_PARROQUIA: CatalogueZone = {
  id: "zone-chacao-parroquia",
  name: "Chacao",
  cityId: CARACAS.id,
  kind: "parroquia",
  category: null,
  parentName: "Chacao",
};
const LOS_PALOS_GRANDES: CatalogueZone = {
  id: "zone-lpg",
  name: "Los Palos Grandes",
  cityId: CARACAS.id,
  kind: "elemento",
  category: "urbanizacion",
  parentName: "Chacao",
};
// «Centro» exists in both Maracaibo and Distrito Capital — the row's OWN
// city must disambiguate it, never a global zone search.
const CENTRO_MARACAIBO: CatalogueZone = {
  id: "zone-centro-mcbo",
  name: "Centro",
  cityId: MARACAIBO.id,
  kind: "parroquia",
  category: null,
  parentName: null,
};
const CENTRO_CARACAS: CatalogueZone = {
  id: "zone-centro-dc",
  name: "Centro",
  cityId: CARACAS.id,
  kind: "elemento",
  category: "barrio",
  parentName: "Catedral",
};

const ZONES: readonly CatalogueZone[] = [
  CHACAO_MUNICIPIO,
  CHACAO_PARROQUIA,
  LOS_PALOS_GRANDES,
  CENTRO_MARACAIBO,
  CENTRO_CARACAS,
];

function rowOf(city: string, zone: string): ImportRow {
  return { city, zone };
}

describe("resolveImportRowLocation — accent- and case-insensitive matching", () => {
  it.each(["Los Palos Grandes", "los palos grandes", "LOS PALOS GRANDES", "Lós Pálos Grandes"])(
    "resolves %s to the same real zone id regardless of accents or case",
    (typedZone) => {
      const outcome = resolveImportRowLocation(rowOf("Distrito Capital", typedZone), CITIES, ZONES);

      expect(outcome.errorMessages).toEqual([]);
      expect(outcome.cityId).toBe(CARACAS.id);
      expect(outcome.zoneId).toBe(LOS_PALOS_GRANDES.id);
    },
  );

  it.each(["Maracaibo", "maracaibo", "MARACAIBO", "Marácaibo"])(
    "resolves the city name %s the same way regardless of accents or case",
    (typedCity) => {
      const outcome = resolveImportRowLocation(rowOf(typedCity, "Centro"), CITIES, ZONES);

      expect(outcome.errorMessages).toEqual([]);
      expect(outcome.cityId).toBe(MARACAIBO.id);
    },
  );
});

describe("resolveImportRowLocation — same zone name, two cities: the row's own city disambiguates", () => {
  it("resolves «Centro» in Maracaibo to Maracaibo's own Centro, not Distrito Capital's", () => {
    const outcome = resolveImportRowLocation(rowOf("Maracaibo", "Centro"), CITIES, ZONES);

    expect(outcome.errorMessages).toEqual([]);
    expect(outcome.zoneId).toBe(CENTRO_MARACAIBO.id);
  });

  it("resolves «Centro» in Distrito Capital to DC's own Centro, not Maracaibo's", () => {
    const outcome = resolveImportRowLocation(rowOf("Distrito Capital", "Centro"), CITIES, ZONES);

    expect(outcome.errorMessages).toEqual([]);
    expect(outcome.zoneId).toBe(CENTRO_CARACAS.id);
  });

  // The zone lookup is scoped to the RESOLVED city — never a global search
  // that happens to land on the right city by accident.
  it("never matches a same-named zone belonging to a different city", () => {
    const outcome = resolveImportRowLocation(rowOf("Maracaibo", "Centro"), CITIES, ZONES);

    expect(outcome.zoneId).not.toBe(CENTRO_CARACAS.id);
  });
});

describe("resolveImportRowLocation — same name, two levels inside one city: refused, not guessed", () => {
  it("refuses «Chacao» in Distrito Capital because it matches BOTH the municipio and the parroquia", () => {
    const outcome = resolveImportRowLocation(rowOf("Distrito Capital", "Chacao"), CITIES, ZONES);

    expect(outcome.zoneId).toBe("");
    expect(outcome.errorMessages).toHaveLength(1);
    const [message] = outcome.errorMessages;
    expect(message).toContain("Chacao");
    expect(message).toContain("Distrito Capital");
    // Says it matches more than one place...
    expect(message).toMatch(/más de un lugar/);
    // ...and names what they are, so the broker can tell them apart.
    expect(message).toContain("municipio");
    expect(message).toContain("parroquia");
  });

  it("does not resolve a zone id when ambiguous — a silent pick is exactly what this refuses", () => {
    const outcome = resolveImportRowLocation(rowOf("Distrito Capital", "chacao"), CITIES, ZONES);

    expect(outcome.zoneId).not.toBe(CHACAO_MUNICIPIO.id);
    expect(outcome.zoneId).not.toBe(CHACAO_PARROQUIA.id);
  });

  it("still resolves the city even when the zone is ambiguous", () => {
    const outcome = resolveImportRowLocation(rowOf("Distrito Capital", "Chacao"), CITIES, ZONES);
    expect(outcome.cityId).toBe(CARACAS.id);
  });
});

describe("resolveImportRowLocation — unknown names, said in plain language", () => {
  it("names which city names ARE valid when the typed one is not one of them", () => {
    const outcome = resolveImportRowLocation(rowOf("Caracas", "Chacao"), CITIES, ZONES);

    expect(outcome.cityId).toBe("");
    expect(outcome.errorMessages).toHaveLength(1);
    const [message] = outcome.errorMessages;
    expect(message).toContain("Caracas");
    expect(message).toContain("Distrito Capital");
    expect(message).toContain("Maracaibo");
  });

  it("names the city when the zone does not exist in it — the existing message shape", () => {
    const outcome = resolveImportRowLocation(rowOf("Maracaibo", "El Rosal"), CITIES, ZONES);

    expect(outcome.zoneId).toBe("");
    expect(outcome.errorMessages).toEqual(["«El Rosal» no existe en Maracaibo."]);
  });

  it("a zone real in another city is still unknown in the wrong one", () => {
    // Chacao is real, but only in Distrito Capital.
    const outcome = resolveImportRowLocation(rowOf("Maracaibo", "Chacao"), CITIES, ZONES);

    expect(outcome.zoneId).toBe("");
    expect(outcome.errorMessages).toEqual(["«Chacao» no existe en Maracaibo."]);
  });
});

describe("resolveImportRowLocation — aliases are deliberately NOT accepted", () => {
  it("refuses a value that is not a real zone.name even if it would match a zone alias elsewhere in the product", () => {
    // "La Castellana" is a common informal alias in this product's real
    // alias index, but it is not any ZONES entry's canonical `name` here —
    // exactly the case an accepted-alias design would resolve and this one
    // refuses.
    const outcome = resolveImportRowLocation(
      rowOf("Distrito Capital", "La Castellana"),
      CITIES,
      ZONES,
    );

    expect(outcome.zoneId).toBe("");
    expect(outcome.errorMessages).toEqual(["«La Castellana» no existe en Distrito Capital."]);
  });
});

describe("resolveImportRowLocation — blank cells pass through untouched", () => {
  it("leaves a blank city cell for the existing cityId.required rule to catch", () => {
    const outcome = resolveImportRowLocation(rowOf("", "Chacao"), CITIES, ZONES);
    expect(outcome.cityId).toBe("");
    expect(outcome.errorMessages).toEqual([]);
  });

  it("leaves a blank zone cell for the existing zoneId.required rule to catch", () => {
    const outcome = resolveImportRowLocation(rowOf("Distrito Capital", ""), CITIES, ZONES);
    expect(outcome.cityId).toBe(CARACAS.id);
    expect(outcome.zoneId).toBe("");
    expect(outcome.errorMessages).toEqual([]);
  });
});

describe("resolveImportRowLocations — per-row, preserving order", () => {
  it("resolves every row independently, in file order", () => {
    const rows: readonly ImportRow[] = [
      rowOf("Maracaibo", "Centro"),
      rowOf("Distrito Capital", "Los Palos Grandes"),
    ];

    const outcomes = resolveImportRowLocations(rows, CITIES, ZONES);

    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]?.zoneId).toBe(CENTRO_MARACAIBO.id);
    expect(outcomes[1]?.zoneId).toBe(LOS_PALOS_GRANDES.id);
  });
});

describe("applyResolvedLocations", () => {
  it("replaces only city/zone, leaving every other field untouched", () => {
    const rows: readonly ImportRow[] = [
      { city: "Maracaibo", zone: "Centro", title: "Aviso", precioUsd: "450" },
    ];
    const outcomes = resolveImportRowLocations(rows, CITIES, ZONES);

    const prepared = applyResolvedLocations(rows, outcomes);

    expect(prepared[0]).toEqual({
      city: MARACAIBO.id,
      zone: CENTRO_MARACAIBO.id,
      title: "Aviso",
      precioUsd: "450",
    });
  });

  it("blanks city/zone for a row that failed resolution, rather than leaving the raw name behind", () => {
    const rows: readonly ImportRow[] = [rowOf("Caracas", "Chacao")];
    const outcomes = resolveImportRowLocations(rows, CITIES, ZONES);

    const prepared = applyResolvedLocations(rows, outcomes);

    expect(prepared[0]?.city).toBe("");
    expect(prepared[0]?.zone).toBe("");
  });
});

/**
 * tasks.md 9.29: un `ImportRowError` lleva ahora, además de la fila y sus
 * razones, las cinco celdas que 14g dibuja. Este archivo prueba el merge —
 * qué razones sobreviven y en qué orden — así que las construye y las
 * proyecta con estos dos ayudantes en vez de repetirlas en cada aserción.
 */
const MERGE_ROWS: readonly ImportRow[] = [
  { externalReference: "REF-1", priceUsd: "450", zone: "Chacao", rooms: "2", title: "t" },
];

function errorWithCells(rowNumber: number, reasons: readonly string[]): ImportRowError {
  return {
    rowNumber,
    reasons,
    cells: importRowCells(MERGE_ROWS[rowNumber - 2] ?? {}),
    offendingCells: offendingCellsFor(reasons),
  };
}

function rowsAndReasons(
  errors: readonly ImportRowError[],
): { rowNumber: number; reasons: readonly string[] }[] {
  return errors.map(({ rowNumber, reasons }) => ({ rowNumber, reasons }));
}

describe("mergeLocationResolutionErrors", () => {
  const NO_ROW_ERRORS: ImportRowValidationOutcome = { validRows: [], errors: [] };

  it("passes an unaffected row's existing error through unchanged", () => {
    const outcome: ImportRowValidationOutcome = {
      validRows: [],
      errors: [errorWithCells(2, ["priceUsd.invalid"])],
    };
    const locationOutcomes = [
      { cityId: CARACAS.id, zoneId: LOS_PALOS_GRANDES.id, errorMessages: [] },
    ];

    const merged = mergeLocationResolutionErrors(outcome, locationOutcomes, MERGE_ROWS);

    expect(rowsAndReasons(merged.errors)).toEqual([
      { rowNumber: 2, reasons: ["priceUsd.invalid"] },
    ]);
  });

  it("passes an unaffected row's valid result through unchanged", () => {
    const outcome: ImportRowValidationOutcome = {
      validRows: [
        {
          rowNumber: 2,
          externalReference: "REF-1",
          listing: {
            publisherType: "broker",
            propertyType: "apartamento",
            title: "t",
            description: "d",
            priceUsd: 450,
            cityId: CARACAS.id,
            zoneId: LOS_PALOS_GRANDES.id,
            rooms: 2,
            areaM2: 80,
            bathrooms: 2,
            contactMethod: "whatsapp",
            contactValue: "04121234567",
          },
        },
      ],
      errors: [],
    };
    const locationOutcomes = [
      { cityId: CARACAS.id, zoneId: LOS_PALOS_GRANDES.id, errorMessages: [] },
    ];

    const merged = mergeLocationResolutionErrors(outcome, locationOutcomes, MERGE_ROWS);

    expect(merged.validRows).toEqual(outcome.validRows);
  });

  it("replaces the generic cityId.unknown/zoneId.notInCity codes with the specific resolution message", () => {
    // Simulates what validateImportRows produces for a row whose city/zone
    // were blanked out by applyResolvedLocations after a resolution failure.
    const outcome: ImportRowValidationOutcome = {
      validRows: [],
      errors: [errorWithCells(2, ["cityId.required", "zoneId.required"])],
    };
    const locationOutcomes = [
      { cityId: "", zoneId: "", errorMessages: ["«Caracas» no es una ciudad válida."] },
    ];

    const merged = mergeLocationResolutionErrors(outcome, locationOutcomes, MERGE_ROWS);

    expect(rowsAndReasons(merged.errors)).toEqual([
      { rowNumber: 2, reasons: ["«Caracas» no es una ciudad válida."] },
    ]);
  });

  it("keeps an INDEPENDENT violation alongside the location message, for the same row", () => {
    const outcome: ImportRowValidationOutcome = {
      validRows: [],
      errors: [errorWithCells(2, ["priceUsd.invalid", "cityId.required"])],
    };
    const locationOutcomes = [
      { cityId: "", zoneId: "", errorMessages: ["«Caracas» no es una ciudad válida."] },
    ];

    const merged = mergeLocationResolutionErrors(outcome, locationOutcomes, MERGE_ROWS);

    expect(rowsAndReasons(merged.errors)).toEqual([
      { rowNumber: 2, reasons: ["«Caracas» no es una ciudad válida.", "priceUsd.invalid"] },
    ]);
  });

  it("creates a fresh error entry for a location failure even when validateImportRows found nothing else wrong", () => {
    const locationOutcomes = [
      { cityId: "", zoneId: "", errorMessages: ["«Caracas» no es una ciudad válida."] },
    ];

    const merged = mergeLocationResolutionErrors(NO_ROW_ERRORS, locationOutcomes, MERGE_ROWS);

    expect(rowsAndReasons(merged.errors)).toEqual([
      { rowNumber: 2, reasons: ["«Caracas» no es una ciudad válida."] },
    ]);
  });

  /**
   * tasks.md 9.29. Para cuando el merge corre, `applyResolvedLocations` ya
   * vació la celda de zona de esta fila — el nombre que la inmobiliaria
   * escribió sólo existe en la fila cruda, que es la que entra por el tercer
   * argumento. Y la razón viaja como frase escrita y no como código, así que
   * la celda a resaltar la nombra este lado: `offendingCellsFor` no puede
   * clasificar una oración.
   */
  it("una falla de ubicación lleva la celda de zona del ARCHIVO y la resalta", () => {
    const locationOutcomes = [
      { cityId: "", zoneId: "", errorMessages: ["«Chacao» no existe en Maracaibo."] },
    ];

    const merged = mergeLocationResolutionErrors(NO_ROW_ERRORS, locationOutcomes, MERGE_ROWS);

    expect(merged.errors[0]?.cells.zone).toBe("Chacao");
    expect(merged.errors[0]?.cells.externalReference).toBe("REF-1");
    expect(merged.errors[0]?.offendingCells).toEqual(["zone"]);
  });

  it("una falla de ubicación con OTRO problema independiente resalta las dos celdas, sin repetir", () => {
    const outcome: ImportRowValidationOutcome = {
      validRows: [],
      errors: [errorWithCells(2, ["priceUsd.invalid", "zoneId.required"])],
    };
    const locationOutcomes = [
      { cityId: "", zoneId: "", errorMessages: ["«Chacao» no existe en Maracaibo."] },
    ];

    const merged = mergeLocationResolutionErrors(outcome, locationOutcomes, MERGE_ROWS);

    expect(merged.errors[0]?.offendingCells).toEqual(["zone", "priceUsd"]);
  });

  it("preserves row numbers and order across many rows", () => {
    const outcome: ImportRowValidationOutcome = {
      validRows: [],
      errors: [errorWithCells(4, ["priceUsd.invalid"])],
    };
    const locationOutcomes = [
      { cityId: CARACAS.id, zoneId: LOS_PALOS_GRANDES.id, errorMessages: [] },
      { cityId: "", zoneId: "", errorMessages: ["«Caracas» no es una ciudad válida."] },
      { cityId: MARACAIBO.id, zoneId: CENTRO_MARACAIBO.id, errorMessages: [] },
      { cityId: CARACAS.id, zoneId: LOS_PALOS_GRANDES.id, errorMessages: [] },
    ];

    const merged = mergeLocationResolutionErrors(outcome, locationOutcomes, MERGE_ROWS);

    expect(rowsAndReasons(merged.errors)).toEqual([
      { rowNumber: 3, reasons: ["«Caracas» no es una ciudad válida."] },
      { rowNumber: 4, reasons: ["priceUsd.invalid"] },
    ]);
  });
});
