import { describe, expect, it, vi } from "vitest";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../identity/application/ports/session.port";
import { UnauthenticatedError } from "../../identity/application/require-authenticated-session";
import type { ListingRepositoryPort } from "../../listing-publication/application/ports/listing-repository.port";
import type { ZoneCataloguePort } from "../../listing-publication/application/ports/zone-catalogue.port";
import { BulkImportDisabledError } from "./authorize-bulk-import";
import type { BulkImportAccountPort } from "./ports/bulk-import-account.port";
import type { ImportAccountContactPort } from "./ports/import-account-contact.port";
import type { ImportFileSourcePort } from "./ports/import-file-source.port";
import { ImportMissingAccountContactError } from "./run-import-validation";
import { validateImport } from "./validate-import";

/**
 * broker-bulk-import spec, "Preview and Confirmation with Per-Row Errors":
 * "Preview alone creates nothing" (tasks.md 9.14).
 */

const SESSION: AuthenticatedSession = { userId: "broker-1", email: null, name: null };

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

function fakeListings(): ListingRepositoryPort {
  return { save: vi.fn() };
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

const REQUIRED_HEADER = "referencia_externa,titulo,descripcion,precio_usd,ciudad,zona";

describe("validateImport", () => {
  it("rejects with UnauthenticatedError when there is no session, before doing anything else", async () => {
    const listings = fakeListings();

    await expect(
      validateImport(sourceFromText(`${REQUIRED_HEADER}\nREF-1,t,d,1,distrito-capital,chacao`), {
        sessionPort: sessionPortReturning(null),
        accounts: accountsReturning({ bulkImportEnabled: true }),
        contact: fakeContact(),
        zones: fakeZones(),
        listings,
      }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(listings.save).not.toHaveBeenCalled();
  });

  it("rejects with BulkImportDisabledError when the account's flag is off", async () => {
    const listings = fakeListings();

    await expect(
      validateImport(sourceFromText(`${REQUIRED_HEADER}\nREF-1,t,d,1,distrito-capital,chacao`), {
        sessionPort: sessionPortReturning(SESSION),
        accounts: accountsReturning({ bulkImportEnabled: false }),
        contact: fakeContact(),
        zones: fakeZones(),
        listings,
      }),
    ).rejects.toBeInstanceOf(BulkImportDisabledError);

    expect(listings.save).not.toHaveBeenCalled();
  });

  it("rejects with ImportMissingAccountContactError when the account has no default contact", async () => {
    const listings = fakeListings();
    const contact: ImportAccountContactPort = {
      findAccountContact: vi.fn().mockResolvedValue(null),
    };

    await expect(
      validateImport(sourceFromText(`${REQUIRED_HEADER}\nREF-1,t,d,1,distrito-capital,chacao`), {
        sessionPort: sessionPortReturning(SESSION),
        accounts: accountsReturning({ bulkImportEnabled: true }),
        contact,
        zones: fakeZones(),
        listings,
      }),
    ).rejects.toBeInstanceOf(ImportMissingAccountContactError);

    expect(listings.save).not.toHaveBeenCalled();
  });

  // tasks.md 9.14: "GIVEN a broker who uploads a file and receives the
  // preview WHEN they abandon the flow without confirming THEN no draft was
  // created." Proven the strongest available way: `listings.save` — the
  // exact port `ConfirmImportUseCase` uses to write — is never invoked.
  it("NEVER calls listings.save — preview creates nothing", async () => {
    const listings = fakeListings();

    const preview = await validateImport(
      sourceFromText(`${REQUIRED_HEADER}\nREF-1,Titulo,Descripcion,450,distrito-capital,chacao`),
      {
        sessionPort: sessionPortReturning(SESSION),
        accounts: accountsReturning({ bulkImportEnabled: true }),
        contact: fakeContact(),
        zones: fakeZones(),
        listings,
      },
    );

    expect(preview.totalRows).toBe(1);
    expect(listings.save).not.toHaveBeenCalled();
  });
});
