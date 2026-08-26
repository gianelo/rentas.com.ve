import { describe, expect, it, vi } from "vitest";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../identity/application/ports/session.port";
import { UnauthenticatedError } from "../../identity/application/require-authenticated-session";
import type { CataloguePort } from "../../listing-catalogue/application/ports/catalogue.port";
import type {
  ListingRepositoryPort,
  NewListing,
} from "../../listing-publication/application/ports/listing-repository.port";
import type { ZoneCataloguePort } from "../../listing-publication/application/ports/zone-catalogue.port";
import { BulkImportDisabledError } from "./authorize-bulk-import";
import { confirmImport } from "./confirm-import";
import type { BulkImportAccountPort } from "./ports/bulk-import-account.port";
import type { ImportAccountContactPort } from "./ports/import-account-contact.port";
import type { ImportFileSourcePort } from "./ports/import-file-source.port";
import { ImportMissingAccountContactError } from "./run-import-validation";

/**
 * broker-bulk-import spec, "Whole-File Validation Before Any Write" +
 * "Preview and Confirmation with Per-Row Errors" + "Idempotent Import by
 * External Reference" (tasks.md 9.13/9.15-9.17).
 *
 * **The idempotency guarantee itself — the unique index actually refusing a
 * duplicate `23505` — is proven against real Postgres**
 * (`tests/integration/broker-bulk-import-confirm.test.ts`), per design.md:
 * "its idempotency guarantee is a unique index, not application code, so a
 * fake would verify the fake." What this file proves is `confirmImport`'s
 * OWN logic: which rows it writes, how it counts them, and how it reacts
 * to a `23505` a fake repository is told to throw.
 */

const SESSION: AuthenticatedSession = { userId: "broker-1", email: null, name: null };
const REQUIRED_HEADER =
  "referencia_externa,titulo,descripcion,precio_usd,ciudad,zona,tipo_inmueble,habitaciones,banos,metros2";
const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

function sessionPortReturning(session: AuthenticatedSession | null): SessionPort {
  return { getSession: vi.fn().mockResolvedValue(session) };
}

function accountsReturning(account: { bulkImportEnabled: boolean } | null): BulkImportAccountPort {
  return { findAccount: vi.fn().mockResolvedValue(account) };
}

function fakeContact(): ImportAccountContactPort {
  return {
    findAccountContact: vi
      .fn()
      .mockResolvedValue({ contactMethod: "whatsapp", contactValue: "04121234567" }),
  };
}

function fakeZones(): ZoneCataloguePort {
  return { listZonesForCity: vi.fn(async (cityId: string) => [{ id: "chacao", cityId }]) };
}

/** Ciudad/zona-by-name resolution — `distrito-capital`/`chacao` in the
 * fixture rows normalize to exactly `Distrito Capital`/`Chacao` below. */
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
  return `${externalReference},Titulo del aviso,"${VALID_DESCRIPTION}",450,distrito-capital,chacao,apartamento,2,2,78`;
}

describe("confirmImport", () => {
  it("rejects with UnauthenticatedError before touching the repository", async () => {
    const save = vi.fn();
    const listings: ListingRepositoryPort = { save };

    await expect(
      confirmImport(sourceFromText(`${REQUIRED_HEADER}\n${validRowLine("REF-1")}`), {
        sessionPort: sessionPortReturning(null),
        accounts: accountsReturning({ bulkImportEnabled: true }),
        contact: fakeContact(),
        zones: fakeZones(),
        catalogue: fakeCatalogue(),
        listings,
      }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(save).not.toHaveBeenCalled();
  });

  it("rejects with BulkImportDisabledError before touching the repository", async () => {
    const save = vi.fn();
    const listings: ListingRepositoryPort = { save };

    await expect(
      confirmImport(sourceFromText(`${REQUIRED_HEADER}\n${validRowLine("REF-1")}`), {
        sessionPort: sessionPortReturning(SESSION),
        accounts: accountsReturning({ bulkImportEnabled: false }),
        contact: fakeContact(),
        zones: fakeZones(),
        catalogue: fakeCatalogue(),
        listings,
      }),
    ).rejects.toBeInstanceOf(BulkImportDisabledError);

    expect(save).not.toHaveBeenCalled();
  });

  it("rejects with ImportMissingAccountContactError before touching the repository", async () => {
    const save = vi.fn();
    const listings: ListingRepositoryPort = { save };

    await expect(
      confirmImport(sourceFromText(`${REQUIRED_HEADER}\n${validRowLine("REF-1")}`), {
        sessionPort: sessionPortReturning(SESSION),
        accounts: accountsReturning({ bulkImportEnabled: true }),
        contact: { findAccountContact: vi.fn().mockResolvedValue(null) },
        zones: fakeZones(),
        catalogue: fakeCatalogue(),
        listings,
      }),
    ).rejects.toBeInstanceOf(ImportMissingAccountContactError);

    expect(save).not.toHaveBeenCalled();
  });

  // tasks.md 9.13: "GIVEN an uploaded file with 38 valid rows and 2 invalid
  // rows WHEN the broker reviews the preview and confirms THEN the system
  // creates 38 drafts and reports the 2 failed rows."
  it("creates exactly the valid rows as drafts, and reports the invalid ones untouched", async () => {
    const save = vi.fn().mockResolvedValue({ id: "new-id" });
    const listings: ListingRepositoryPort = { save };

    const validLines = Array.from({ length: 38 }, (_, i) => validRowLine(`OK-${i}`));
    const invalidLines = [
      `BAD-1,Titulo,"${VALID_DESCRIPTION}",not-a-number,distrito-capital,chacao,apartamento,2,2,78`,
      `BAD-2,Titulo,"${VALID_DESCRIPTION}",450,distrito-capital,zona-inexistente,apartamento,2,2,78`,
    ];
    const text = `${REQUIRED_HEADER}\n${[...validLines, ...invalidLines].join("\n")}`;

    const result = await confirmImport(sourceFromText(text), {
      sessionPort: sessionPortReturning(SESSION),
      accounts: accountsReturning({ bulkImportEnabled: true }),
      contact: fakeContact(),
      zones: fakeZones(),
      catalogue: fakeCatalogue(),
      listings,
      now: () => new Date("2026-08-24T00:00:00Z"),
    });

    expect(result.totalRows).toBe(40);
    expect(result.createdCount).toBe(38);
    expect(save).toHaveBeenCalledTimes(38);
    expect(result.errors).toHaveLength(2);
    expect(result.skippedDuplicates).toEqual([]);
  });

  it("writes a draft with status 'draft', the external reference, and no photos", async () => {
    let captured: NewListing | undefined;
    const save = vi.fn().mockImplementation(async (listing: NewListing) => {
      captured = listing;
      return { id: "new-id" };
    });
    const listings: ListingRepositoryPort = { save };

    await confirmImport(sourceFromText(`${REQUIRED_HEADER}\n${validRowLine("REF-1")}`), {
      sessionPort: sessionPortReturning(SESSION),
      accounts: accountsReturning({ bulkImportEnabled: true }),
      contact: fakeContact(),
      zones: fakeZones(),
      catalogue: fakeCatalogue(),
      listings,
      now: () => new Date("2026-08-24T00:00:00Z"),
    });

    expect(captured?.status).toBe("draft");
    expect(captured?.externalReference).toBe("REF-1");
    expect(captured?.photos).toEqual([]);
    expect(captured?.publisherType).toBe("broker");
    expect(captured?.contactMethod).toBe("whatsapp");
    expect(captured?.contactValue).toBe("04121234567");
    expect(captured?.publisherId).toBe("broker-1");
  });

  // tasks.md 9.16/9.17: idempotency is the unique index, caught per row —
  // never a SELECT-then-INSERT. Simulated here with a fake that throws the
  // exact shape Postgres raises; the real constraint is proven in the
  // integration suite.
  it("treats a 23505 from the repository as an already-imported row, not a failure", async () => {
    const save = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }));
    const listings: ListingRepositoryPort = { save };

    const result = await confirmImport(
      sourceFromText(`${REQUIRED_HEADER}\n${validRowLine("REF-1")}`),
      {
        sessionPort: sessionPortReturning(SESSION),
        accounts: accountsReturning({ bulkImportEnabled: true }),
        contact: fakeContact(),
        zones: fakeZones(),
        catalogue: fakeCatalogue(),
        listings,
      },
    );

    expect(result.createdCount).toBe(0);
    expect(result.skippedDuplicates).toEqual([{ rowNumber: 2, externalReference: "REF-1" }]);
  });

  it("rethrows an unexpected repository error rather than treating it as a duplicate", async () => {
    const save = vi.fn().mockRejectedValue(new Error("connection reset"));
    const listings: ListingRepositoryPort = { save };

    await expect(
      confirmImport(sourceFromText(`${REQUIRED_HEADER}\n${validRowLine("REF-1")}`), {
        sessionPort: sessionPortReturning(SESSION),
        accounts: accountsReturning({ bulkImportEnabled: true }),
        contact: fakeContact(),
        zones: fakeZones(),
        catalogue: fakeCatalogue(),
        listings,
      }),
    ).rejects.toThrow("connection reset");
  });

  // tasks.md 9.16: "an uploaded file containing the same referencia_externa
  // on two rows... both rows are reported as invalid and no draft is
  // created for either" — proven end to end through confirmImport, not
  // only at the domain layer.
  it("creates no draft for either row when referencia_externa is duplicated within the file", async () => {
    const save = vi.fn().mockResolvedValue({ id: "new-id" });
    const listings: ListingRepositoryPort = { save };

    const text = `${REQUIRED_HEADER}\n${validRowLine("DUP-1")}\n${validRowLine("DUP-1")}`;

    const result = await confirmImport(sourceFromText(text), {
      sessionPort: sessionPortReturning(SESSION),
      accounts: accountsReturning({ bulkImportEnabled: true }),
      contact: fakeContact(),
      zones: fakeZones(),
      catalogue: fakeCatalogue(),
      listings,
    });

    expect(save).not.toHaveBeenCalled();
    expect(result.createdCount).toBe(0);
    expect(result.errors).toEqual([
      { rowNumber: 2, reasons: ["externalReference.duplicateInFile"] },
      { rowNumber: 3, reasons: ["externalReference.duplicateInFile"] },
    ]);
  });
});
