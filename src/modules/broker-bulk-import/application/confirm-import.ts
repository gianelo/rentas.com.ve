import type { SessionPort } from "../../identity/application/ports/session.port";
import type { CataloguePort } from "../../listing-catalogue/application/ports/catalogue.port";
import type { ListingRepositoryPort } from "../../listing-publication/application/ports/listing-repository.port";
import type { ZoneCataloguePort } from "../../listing-publication/application/ports/zone-catalogue.port";
import type { ImportRowError, ValidImportRow } from "../domain/import-row-validation";
import { authorizeBulkImport } from "./authorize-bulk-import";
import type { BulkImportAccountPort } from "./ports/bulk-import-account.port";
import type { ImportAccountContactPort } from "./ports/import-account-contact.port";
import type { ImportFileSourcePort } from "./ports/import-file-source.port";
import { runImportValidation } from "./run-import-validation";

export interface ConfirmImportDependencies {
  readonly sessionPort: SessionPort;
  readonly accounts: BulkImportAccountPort;
  readonly contact: ImportAccountContactPort;
  readonly zones: ZoneCataloguePort;
  /** Ciudad/zona-by-name resolution — see `RunImportValidationDependencies`. */
  readonly catalogue: CataloguePort;
  readonly listings: ListingRepositoryPort;
  readonly now?: () => Date;
}

export interface SkippedDuplicateRow {
  readonly rowNumber: number;
  readonly externalReference: string;
}

export interface ConfirmImportResult {
  readonly totalRows: number;
  readonly createdCount: number;
  readonly skippedDuplicates: readonly SkippedDuplicateRow[];
  readonly errors: readonly ImportRowError[];
}

/** Postgres' unique-violation SQLSTATE — the same code checked directly
 * against `pool.query`'s rejection in tests/integration/broker-bulk-
 * import.test.ts (tasks.md 9.1). */
const UNIQUE_VIOLATION_CODE = "23505";

function pgErrorCode(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error) return (error as { code?: unknown }).code;
  return undefined;
}

/**
 * Drizzle (`node-postgres` driver) wraps the raw `pg` error inside a
 * `DrizzleQueryError`, which carries the ORIGINAL error — the one with
 * `.code === "23505"` — on `.cause`, not on itself (confirmed against real
 * Postgres in tests/integration/broker-bulk-import-confirm.test.ts: the
 * outer error's own `.code` is `undefined`). Checking both is what makes
 * this catch the SAME `23505` the raw-`pg` integration test in tasks.md
 * 9.1 asserted directly, through the one extra layer `ListingRepositoryPort`
 * adds.
 */
function isUniqueViolation(error: unknown): boolean {
  if (pgErrorCode(error) === UNIQUE_VIOLATION_CODE) return true;
  const cause = error instanceof Error ? error.cause : undefined;
  return pgErrorCode(cause) === UNIQUE_VIOLATION_CODE;
}

/**
 * broker-bulk-import spec, "Whole-File Validation Before Any Write" +
 * "Preview and Confirmation with Per-Row Errors" + "Idempotent Import by
 * External Reference" (tasks.md 9.13/9.15-9.17).
 *
 * **Validate-all-then-write, not a database transaction — and that is a
 * deliberate choice, not the absence of one.** `runImportValidation`
 * decides every row's validity in memory BEFORE this function writes a
 * single one, so "a late invalid row does not leave earlier rows written"
 * (spec scenario) holds because row 40's validity is already known before
 * row 1 is ever saved — not because the writes below share one transaction.
 * A transaction was the other option, and it was not taken because
 * `ListingRepositoryPort.save` already owns ITS OWN transaction per
 * listing (the row plus its photo rows); wrapping 40 independent listings
 * in one bigger transaction would only buy atomicity nothing here needs —
 * each row is a separate draft, and row 6 succeeding was never contingent
 * on row 5 succeeding.
 *
 * **Idempotency is the unique `(publisher_id, external_reference)` index,
 * never a SELECT-then-INSERT** (tasks.md 9.17, design.md D9): every valid
 * row is simply inserted, and a `23505` from Postgres is caught per row and
 * reported as already imported rather than re-thrown. A pre-check has a
 * race — the constraint does not.
 *
 * **No write path of its own into `listing`** (Phase 9's own header note):
 * `listings.save` is the exact port `PublishListingUseCase` already calls.
 * This function only decides WHAT `NewListing` to build and WHICH status —
 * `"draft"`, never `"active"` — the write itself is the same call
 * publishing one listing already makes.
 */
export async function confirmImport(
  source: ImportFileSourcePort,
  dependencies: ConfirmImportDependencies,
): Promise<ConfirmImportResult> {
  const { userId } = await authorizeBulkImport(dependencies);
  const { listings } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  const { totalRows, validRows, errors } = await runImportValidation(userId, source, dependencies);

  const skippedDuplicates: SkippedDuplicateRow[] = [];
  let createdCount = 0;

  for (const row of validRows as readonly ValidImportRow[]) {
    const publishedAt = now();
    try {
      await listings.save({
        publisherId: userId,
        publisherType: row.listing.publisherType,
        propertyType: row.listing.propertyType,
        cityId: row.listing.cityId,
        zoneId: row.listing.zoneId,
        title: row.listing.title,
        description: row.listing.description,
        priceUsd: row.listing.priceUsd,
        rooms: row.listing.rooms,
        areaM2: row.listing.areaM2,
        bathrooms: row.listing.bathrooms,
        hasPowerPlant: row.listing.hasPowerPlant ?? false,
        hasRegularWater: row.listing.hasRegularWater ?? false,
        isFurnished: row.listing.isFurnished ?? false,
        hasSecurity: row.listing.hasSecurity ?? false,
        hasAppliances: row.listing.hasAppliances ?? false,
        parkingSpots: row.listing.parkingSpots ?? 0,
        contactMethod: row.listing.contactMethod,
        contactValue: row.listing.contactValue,
        status: "draft",
        externalReference: row.externalReference,
        publishedAt,
        // Placeholder until activation (tasks.md 9.18/9.19) recomputes both
        // from the activation moment — spec: "Expiry clock starts at
        // activation, not at import." A draft is excluded from every
        // expiry-driven query by its `status` alone, so this value carries
        // no meaning before that; it exists only because `expires_at` is
        // NOT NULL at the schema level and a draft row still has to satisfy
        // it. Recorded as a deviation per AGENTS.md §5 — see tasks.md 9.15.
        expiresAt: publishedAt,
        photos: [],
      });
      createdCount += 1;
    } catch (error) {
      if (isUniqueViolation(error)) {
        skippedDuplicates.push({
          rowNumber: row.rowNumber,
          externalReference: row.externalReference,
        });
        continue;
      }
      throw error;
    }
  }

  return { totalRows, createdCount, skippedDuplicates, errors };
}
