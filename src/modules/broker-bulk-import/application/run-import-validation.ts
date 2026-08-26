import type { CataloguePort } from "../../listing-catalogue/application/ports/catalogue.port";
import type { ZoneCataloguePort } from "../../listing-publication/application/ports/zone-catalogue.port";
import { resolveImportAccountContact } from "../domain/import-account-contact";
import {
  type ImportRowValidationOutcome,
  validateImportRows,
} from "../domain/import-row-validation";
import {
  applyResolvedLocations,
  mergeLocationResolutionErrors,
  resolveImportRowLocations,
} from "../domain/resolve-import-locations";
import { collectCuratedZonesForRows } from "./collect-curated-zones";
import { parseImportFile } from "./parse-import-file";
import type { ImportAccountContactPort } from "./ports/import-account-contact.port";
import type { ImportFileSourcePort } from "./ports/import-file-source.port";

/**
 * design.md's contact rule, made executable at the import boundary:
 * `listing.contact_method`/`contact_value` are NOT NULL, `user.contact_
 * method`/`contact_value` are nullable, and the CSV never carries contact
 * at all. An account with no default cannot produce a single valid draft —
 * refusing fifty rows that could never be activated, silently, is worse
 * than refusing the whole import up front with an actionable message.
 */
export class ImportMissingAccountContactError extends Error {
  constructor() {
    super(
      "run-import-validation: the importing account has no default contact method " +
        "configured. Set a contact method and value on your account before importing — " +
        "an imported draft with no way to reveal contact could never be activated.",
    );
    this.name = "ImportMissingAccountContactError";
  }
}

export interface ImportValidationOutcome extends ImportRowValidationOutcome {
  readonly totalRows: number;
}

export interface RunImportValidationDependencies {
  readonly contact: ImportAccountContactPort;
  readonly zones: ZoneCataloguePort;
  /**
   * Read access to the FULL city/zone taxonomy — names included — for
   * `resolve-import-locations.ts`'s ciudad/zona-by-name resolution.
   * `ZoneCataloguePort` above stays scoped to ids per city (what the
   * curated-zone rule needs); `CataloguePort` is reused UNCHANGED from
   * `listing-catalogue` (same decision `generate-import-template.ts`
   * already made) rather than widened into a second "list everything"
   * port.
   */
  readonly catalogue: CataloguePort;
}

/**
 * broker-bulk-import spec, "Whole-File Validation Before Any Write" +
 * "Preview and Confirmation with Per-Row Errors" (tasks.md 9.12-9.17).
 *
 * **The one place both `ValidateImportUseCase` (preview) and
 * `ConfirmImportUseCase` (confirm) run validation.** Calling this function
 * twice against the same file produces the same verdict — which is what
 * makes "confirm creates exactly the rows the preview reported as valid"
 * true by construction, rather than by two independent implementations
 * happening to agree. Order, and why: the account-contact guard runs before
 * a single byte of the file is parsed, because a broker whose account is
 * missing a default contact learns that immediately rather than after
 * waiting on a 2 MB upload to parse.
 */
export async function runImportValidation(
  userId: string,
  source: ImportFileSourcePort,
  dependencies: RunImportValidationDependencies,
): Promise<ImportValidationOutcome> {
  const { contact, zones, catalogue } = dependencies;

  const account = await contact.findAccountContact(userId);
  const resolvedContact = resolveImportAccountContact(account);
  if (!resolvedContact) {
    throw new ImportMissingAccountContactError();
  }

  const { rows } = await parseImportFile(source);

  // Name -> id resolution runs BEFORE the curated-zone rule and before
  // validateImportRows — everything past this point keeps working in ids,
  // unchanged (mvp-rental-listings unplanned work unit: "bulk import:
  // resolve ciudad and zona by name").
  const [cities, catalogueZones] = await Promise.all([
    catalogue.listCities(),
    catalogue.listZones(),
  ]);
  const locationOutcomes = resolveImportRowLocations(rows, cities, catalogueZones);
  const preparedRows = applyResolvedLocations(rows, locationOutcomes);

  const curatedZones = await collectCuratedZonesForRows(preparedRows, zones);

  const validationOutcome = validateImportRows(preparedRows, curatedZones, resolvedContact);
  const outcome = mergeLocationResolutionErrors(validationOutcome, locationOutcomes);

  return { totalRows: rows.length, ...outcome };
}
