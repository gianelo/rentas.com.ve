import { describe, expect, it, vi } from "vitest";
import type { CataloguePort } from "../../listing-catalogue/application/ports/catalogue.port";
import type { ZoneCataloguePort } from "../../listing-publication/application/ports/zone-catalogue.port";
import type { AccountDefaultContact } from "../domain/import-account-contact";
import type { ImportAccountContactPort } from "./ports/import-account-contact.port";
import type { ImportFileSourcePort } from "./ports/import-file-source.port";
import { ImportMissingAccountContactError, runImportValidation } from "./run-import-validation";

/**
 * broker-bulk-import spec, "Whole-File Validation Before Any Write" (tasks.md
 * 9.12-9.17). **The one place both `ValidateImportUseCase` and
 * `ConfirmImportUseCase` run validation** — calling this function twice with
 * the same file produces the same verdict, which is what makes "confirm
 * creates exactly the rows the preview reported as valid" true by
 * construction.
 */

const REQUIRED_HEADER =
  "referencia_externa,titulo,descripcion,precio_usd,ciudad,zona,tipo_inmueble,habitaciones,banos,metros2,estacionamientos";

const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

function sourceFromText(text: string): ImportFileSourcePort {
  const bytes = new TextEncoder().encode(text);
  return {
    declaredByteLength: bytes.byteLength,
    async *chunks() {
      yield bytes;
    },
  };
}

function validRowLine(externalReference: string): string {
  // The description contains commas, so it MUST be quoted — an unquoted
  // comma inside a field would shift every column after it (csv-import-
  // rows.ts's own tokenizer test documents the same requirement).
  return `${externalReference},Apartamento en Chacao,"${VALID_DESCRIPTION}",450,distrito-capital,chacao,apartamento,2,2,78,1`;
}

function contactPortReturning(contact: AccountDefaultContact | null): ImportAccountContactPort {
  return { findAccountContact: vi.fn().mockResolvedValue(contact) };
}

const FULL_CONTACT: AccountDefaultContact = {
  contactMethod: "whatsapp",
  contactValue: "04121234567",
};

function zonesReturningAllCurated(): ZoneCataloguePort {
  return {
    listZonesForCity: vi.fn(async (cityId: string) => [{ id: "chacao", cityId }]),
  };
}

/**
 * Ciudad/zona-by-name resolution (mvp-rental-listings unplanned work unit)
 * needs the FULL name catalogue. `validRowLine` writes `distrito-capital`/
 * `chacao` — these normalize (accent/case-insensitive, same as
 * `Distrito Capital`/`Chacao`) to exactly these real names, so the fixture
 * stays readable while still exercising the real resolver rather than a
 * bypass.
 */
function fakeCatalogue(): CataloguePort {
  return {
    listCities: vi.fn(async () => [
      { id: "city-dc", name: "Distrito Capital" },
      { id: "city-mcbo", name: "Maracaibo" },
    ]),
    listZones: vi.fn(async () => [
      {
        id: "chacao",
        name: "Chacao",
        cityId: "city-dc",
        kind: "municipio" as const,
        category: null,
        parentName: null,
      },
    ]),
  };
}

describe("runImportValidation", () => {
  it("refuses the whole import up front when the account has no default contact — fails closed", async () => {
    const text = `${REQUIRED_HEADER}\n${validRowLine("REF-1")}`;

    await expect(
      runImportValidation("broker-1", sourceFromText(text), {
        contact: contactPortReturning(null),
        zones: zonesReturningAllCurated(),
        catalogue: fakeCatalogue(),
      }),
    ).rejects.toBeInstanceOf(ImportMissingAccountContactError);
  });

  it("parses and validates the whole file, returning valid rows and per-row errors", async () => {
    const text = `${REQUIRED_HEADER}\n${validRowLine("REF-1")}\n${validRowLine("REF-1")}`;

    const result = await runImportValidation("broker-1", sourceFromText(text), {
      contact: contactPortReturning(FULL_CONTACT),
      zones: zonesReturningAllCurated(),
      catalogue: fakeCatalogue(),
    });

    expect(result.totalRows).toBe(2);
    // Both rows share REF-1 — the within-file duplicate check rejects both.
    expect(result.validRows).toEqual([]);
    expect(result.errors).toHaveLength(2);
  });

  it("accepts a well-formed row end to end", async () => {
    const text = `${REQUIRED_HEADER}\n${validRowLine("REF-1")}`;

    const result = await runImportValidation("broker-1", sourceFromText(text), {
      contact: contactPortReturning(FULL_CONTACT),
      zones: zonesReturningAllCurated(),
      catalogue: fakeCatalogue(),
    });

    expect(result.totalRows).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]?.listing.contactValue).toBe("04121234567");
  });

  // mvp-rental-listings unplanned work unit: "bulk import: resolve ciudad
  // and zona by name instead of UUID". End-to-end proof that the FULL
  // pipeline — parse, resolve, validate — rejects an unrecognised city
  // name rather than silently treating it as a UUID nobody's zone matches.
  it("refuses a row whose ciudad is not a registered city, naming which ones ARE valid", async () => {
    const text = `${REQUIRED_HEADER}\nREF-1,t,"${VALID_DESCRIPTION}",450,Caracas,Chacao,apartamento,2,2,78,1`;

    const result = await runImportValidation("broker-1", sourceFromText(text), {
      contact: contactPortReturning(FULL_CONTACT),
      zones: zonesReturningAllCurated(),
      catalogue: fakeCatalogue(),
    });

    expect(result.validRows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    const [error] = result.errors;
    expect(error?.reasons).toHaveLength(1);
    expect(error?.reasons[0]).toContain("Caracas");
    expect(error?.reasons[0]).toContain("Distrito Capital");
    expect(error?.reasons[0]).toContain("Maracaibo");
  });

  it("refuses a row whose zona does not exist in its ciudad, naming the city", async () => {
    const text = `${REQUIRED_HEADER}\nREF-1,t,"${VALID_DESCRIPTION}",450,Distrito Capital,El Rosal,apartamento,2,2,78,1`;

    const result = await runImportValidation("broker-1", sourceFromText(text), {
      contact: contactPortReturning(FULL_CONTACT),
      zones: zonesReturningAllCurated(),
      catalogue: fakeCatalogue(),
    });

    expect(result.errors).toEqual([
      {
        rowNumber: 2,
        reasons: ["«El Rosal» no existe en Distrito Capital."],
        // tasks.md 9.29: la celda lleva el nombre que se escribió en el
        // archivo. Para cuando el validador corre, `applyResolvedLocations`
        // ya la reemplazó — y en esta fila no pudo, así que tomarla de la
        // fila preparada daría vacío en vez de «El Rosal».
        cells: {
          externalReference: "REF-1",
          priceUsd: "450",
          zone: "El Rosal",
          rooms: "2",
          title: "t",
          descriptionLength: 162,
        },
        offendingCells: ["zone"],
      },
    ]);
  });

  it("refuses an ambiguous zone name rather than guessing which of several places it means", async () => {
    const catalogue: CataloguePort = {
      listCities: vi.fn(async () => [{ id: "city-dc", name: "Distrito Capital" }]),
      listZones: vi.fn(async () => [
        {
          id: "chacao-municipio",
          name: "Chacao",
          cityId: "city-dc",
          kind: "municipio" as const,
          category: null,
          parentName: null,
        },
        {
          id: "chacao-parroquia",
          name: "Chacao",
          cityId: "city-dc",
          kind: "parroquia" as const,
          category: null,
          parentName: "Chacao",
        },
      ]),
    };
    const text = `${REQUIRED_HEADER}\nREF-1,t,"${VALID_DESCRIPTION}",450,Distrito Capital,Chacao,apartamento,2,2,78,1`;

    const result = await runImportValidation("broker-1", sourceFromText(text), {
      contact: contactPortReturning(FULL_CONTACT),
      zones: zonesReturningAllCurated(),
      catalogue,
    });

    expect(result.validRows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    const [error] = result.errors;
    expect(error?.reasons[0]).toMatch(/más de un lugar/);
    expect(error?.reasons[0]).toContain("municipio");
    expect(error?.reasons[0]).toContain("parroquia");
  });

  it("resolves the ciudad/zona names regardless of accents or case (chacao, CHACAO, Chácao all resolve)", async () => {
    for (const typed of ["chacao", "CHACAO", "Chácao"]) {
      const text = `${REQUIRED_HEADER}\nREF-ACCENT,t,"${VALID_DESCRIPTION}",450,Distrito Capital,${typed},apartamento,2,2,78,1`;

      const result = await runImportValidation("broker-1", sourceFromText(text), {
        contact: contactPortReturning(FULL_CONTACT),
        zones: zonesReturningAllCurated(),
        catalogue: fakeCatalogue(),
      });

      expect(result.errors).toEqual([]);
      expect(result.validRows).toHaveLength(1);
      expect(result.validRows[0]?.listing.zoneId).toBe("chacao");
    }
  });

  // The zone lookup must be scoped to the RESOLVED city, never global —
  // "Chacao" only exists under Distrito Capital in this fixture, so asking
  // for it under Maracaibo must fail, not silently borrow the other city's
  // zone.
  it("never resolves a zone name against a different city than the row's own", async () => {
    const text = `${REQUIRED_HEADER}\nREF-1,t,"${VALID_DESCRIPTION}",450,Maracaibo,Chacao,apartamento,2,2,78,1`;

    const result = await runImportValidation("broker-1", sourceFromText(text), {
      contact: contactPortReturning(FULL_CONTACT),
      zones: zonesReturningAllCurated(),
      catalogue: fakeCatalogue(),
    });

    expect(result.validRows).toEqual([]);
    expect(result.errors).toEqual([
      {
        rowNumber: 2,
        reasons: ["«Chacao» no existe en Maracaibo."],
        cells: {
          externalReference: "REF-1",
          priceUsd: "450",
          zone: "Chacao",
          rooms: "2",
          title: "t",
          descriptionLength: 162,
        },
        offendingCells: ["zone"],
      },
    ]);
  });

  /**
   * tasks.md 9.29, el caso decisivo. Esta fila SÍ resuelve su zona: el
   * validador la ve como el id `chacao`, y su problema es otro (falta el
   * precio). La lámina 14g escribe «Chacao» en esa celda, con mayúscula,
   * porque es lo que la inmobiliaria escribió — un `cells` armado desde la
   * fila preparada diría `chacao`, el id, y esta prueba distingue una cosa
   * de la otra.
   */
  it("una fila cuya zona SÍ resolvió lleva igual el nombre del archivo en su celda, no el id resuelto", async () => {
    const text = `${REQUIRED_HEADER}\nREF-9,Apartamento 3 hab con puesto techado,"${VALID_DESCRIPTION}",,Distrito Capital,Chacao,apartamento,3,2,78,1`;

    const result = await runImportValidation("broker-1", sourceFromText(text), {
      contact: contactPortReturning(FULL_CONTACT),
      zones: zonesReturningAllCurated(),
      catalogue: fakeCatalogue(),
    });

    expect(result.errors).toHaveLength(1);
    const [error] = result.errors;
    expect(error?.reasons).toEqual(["priceUsd.required"]);
    expect(error?.cells).toEqual({
      externalReference: "REF-9",
      priceUsd: "",
      zone: "Chacao",
      rooms: "3",
      title: "Apartamento 3 hab con puesto techado",
      descriptionLength: 162,
    });
    // El precio es lo que 14g resalta en su propia celda.
    expect(error?.offendingCells).toEqual(["priceUsd"]);
  });
});
