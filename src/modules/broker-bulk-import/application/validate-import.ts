import type { SessionPort } from "../../identity/application/ports/session.port";
import type { ListingRepositoryPort } from "../../listing-publication/application/ports/listing-repository.port";
import type { ZoneCataloguePort } from "../../listing-publication/application/ports/zone-catalogue.port";
import { authorizeBulkImport } from "./authorize-bulk-import";
import type { BulkImportAccountPort } from "./ports/bulk-import-account.port";
import type { ImportAccountContactPort } from "./ports/import-account-contact.port";
import type { ImportFileSourcePort } from "./ports/import-file-source.port";
import { type ImportValidationOutcome, runImportValidation } from "./run-import-validation";

export interface ValidateImportDependencies {
  readonly sessionPort: SessionPort;
  readonly accounts: BulkImportAccountPort;
  readonly contact: ImportAccountContactPort;
  readonly zones: ZoneCataloguePort;
  /**
   * NEVER called by this use case — spec: "Preview alone creates nothing"
   * (tasks.md 9.14). Present here only so `ValidateImportDependencies` and
   * `ConfirmImportDependencies` share the exact same shape: one place a
   * caller wires the ports, and a test can assert directly that `.save` was
   * never invoked rather than only that a listing count stayed at zero.
   */
  readonly listings: ListingRepositoryPort;
}

/**
 * broker-bulk-import spec, "Whole-File Validation Before Any Write" +
 * "Preview and Confirmation with Per-Row Errors" (tasks.md 9.13-9.15).
 *
 * **Every import endpoint calls `authorizeBulkImport` first** — same
 * precedent `authorize-bulk-import.ts` sets: the session gate and the flag
 * check both run before a single byte of the upload is read.
 *
 * This function's own guarantee is narrower and just as load-bearing: it
 * calls `runImportValidation` and returns whatever it reports — nothing
 * past that point touches `dependencies.listings`. There is no code path
 * inside this function capable of creating a draft.
 */
export async function validateImport(
  source: ImportFileSourcePort,
  dependencies: ValidateImportDependencies,
): Promise<ImportValidationOutcome> {
  const { userId } = await authorizeBulkImport(dependencies);
  return runImportValidation(userId, source, dependencies);
}
