import { describe, expect, it, vi } from "vitest";
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

describe("runImportValidation", () => {
  it("refuses the whole import up front when the account has no default contact — fails closed", async () => {
    const text = `${REQUIRED_HEADER}\n${validRowLine("REF-1")}`;

    await expect(
      runImportValidation("broker-1", sourceFromText(text), {
        contact: contactPortReturning(null),
        zones: zonesReturningAllCurated(),
      }),
    ).rejects.toBeInstanceOf(ImportMissingAccountContactError);
  });

  it("parses and validates the whole file, returning valid rows and per-row errors", async () => {
    const text = `${REQUIRED_HEADER}\n${validRowLine("REF-1")}\n${validRowLine("REF-1")}`;

    const result = await runImportValidation("broker-1", sourceFromText(text), {
      contact: contactPortReturning(FULL_CONTACT),
      zones: zonesReturningAllCurated(),
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
    });

    expect(result.totalRows).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]?.listing.contactValue).toBe("04121234567");
  });
});
