import type {
  ContactMethod,
  CuratedZone,
  DraftListing,
  PropertyType,
  PublishViolation,
} from "../../listing-publication/domain/publishable-listing";
import { validatePublishableListing } from "../../listing-publication/domain/publishable-listing";
import { parseImportBooleanCell } from "./csv-import-boolean-cell";
import {
  IMPORT_BOOLEAN_COLUMNS,
  IMPORT_COLUMN_ALLOWLIST,
  type OptionalImportColumn,
} from "./csv-import-columns";
import type { ImportRow } from "./csv-import-rows";
import {
  type ImportRowCellName,
  type ImportRowCells,
  importRowCells,
  offendingCellsFor,
} from "./import-row-cells";

/**
 * The five F6 field names (`hasPowerPlant`...), derived from the SAME
 * allowlist the parser reads (`csv-import-columns.ts`) rather than
 * hard-coded a second time — the same "one source, both sides move
 * together" reasoning that array's own doc comment states for the parser
 * and the future template generator.
 */
const BOOLEAN_FIELD_NAMES: readonly string[] = IMPORT_COLUMN_ALLOWLIST.filter((column) =>
  IMPORT_BOOLEAN_COLUMNS.has(column.header as OptionalImportColumn),
).map((column) => column.field);

/**
 * **Widened to include `string`, and this is a deviation from the "stable,
 * translatable codes" idiom `PublishViolation` documents — recorded per
 * AGENTS.md §5, not left implicit.** Every code below still applies exactly
 * as before. The addition is for `resolve-import-locations.ts`'s
 * name-resolution errors ("«Caracas» no es una ciudad válida. Ciudades
 * disponibles: …", "«Chacao» coincide con más de un lugar…"): unlike every
 * other violation here, WHICH names are valid or WHICH places an ambiguous
 * name matches is data the row itself decides, not a fixed sentence a
 * `Record<Code, Copy>` table could hold — and unlike `PublishViolation`,
 * this pipeline has no consuming copy table (`app/publicar/violation-
 * copy.ts` has no bulk-import counterpart; 9.26's Import UI does not exist
 * yet) to translate a code into that sentence later. The message is
 * rendered once, in the domain, and travels as the reason itself.
 */
export type ImportRowViolation =
  | PublishViolation
  | "externalReference.required"
  | "externalReference.duplicateInFile"
  | "hasPowerPlant.invalid"
  | "hasRegularWater.invalid"
  | "isFurnished.invalid"
  | "hasSecurity.invalid"
  | "hasAppliances.invalid"
  | string;

export interface ImportRowError {
  readonly rowNumber: number;
  readonly reasons: readonly ImportRowViolation[];
  /**
   * tasks.md 9.29 — las cinco celdas que la lámina 14g dibuja al lado del
   * problema, **tal como venían en el archivo**. Sin ellas la vista previa
   * podía nombrar la fila y el problema pero no el valor ofensor, y la copia
   * de `description.tooShort` no tenía con qué decir «tiene 61» (el desvío 2
   * de la 9.26, y el `PublishCopyContext` que `app/importar/import-copy.ts`
   * dice por escrito que no tiene).
   */
  readonly cells: ImportRowCells;
  /** Cuál de esas celdas resaltar. Vacío cuando ninguna de las cinco lo es. */
  readonly offendingCells: readonly ImportRowCellName[];
}

/** Everything `ConfirmImportUseCase` needs to build one `NewListing`, minus
 * what only the use case knows (`publisherId`, `status`, dates, photos). */
export interface ImportListingCandidate {
  readonly publisherType: "broker";
  readonly propertyType: PropertyType;
  readonly title: string;
  readonly description: string;
  readonly priceUsd: number;
  readonly cityId: string;
  readonly zoneId: string;
  readonly rooms: number;
  readonly areaM2: number;
  readonly bathrooms: number;
  readonly parkingSpots?: number;
  readonly hasPowerPlant?: boolean;
  readonly hasRegularWater?: boolean;
  readonly isFurnished?: boolean;
  readonly hasSecurity?: boolean;
  readonly hasAppliances?: boolean;
  readonly contactMethod: ContactMethod;
  readonly contactValue: string;
}

export interface ValidImportRow {
  readonly rowNumber: number;
  readonly externalReference: string;
  readonly listing: ImportListingCandidate;
}

export interface ImportRowValidationOutcome {
  readonly validRows: readonly ValidImportRow[];
  readonly errors: readonly ImportRowError[];
}

export interface ImportAccountContact {
  readonly contactMethod: ContactMethod;
  readonly contactValue: string;
}

function orUndefined(raw: string | undefined): string | undefined {
  return raw === undefined || raw === "" ? undefined : raw;
}

function parseOptionalNumber(raw: string | undefined): number | undefined {
  return raw === undefined || raw === "" ? undefined : Number(raw);
}

/**
 * broker-bulk-import spec, "Whole-File Validation Before Any Write" +
 * "Preview and Confirmation with Per-Row Errors" + "Idempotent Import by
 * External Reference" (tasks.md 9.12/9.13/9.16).
 *
 * **Reuses `validatePublishableListing` for every rule it already owns**
 * (curated zone, USD price, room count, contact shape...) — passed the
 * `"draft"` stage (`publishable-listing.ts`) so the photo-count rule, which
 * that function's own doc now states is an ACTIVATION concern, never fires
 * here. This function adds only what `validatePublishableListing` has no
 * opinion about: `referencia_externa` (not a `listing` column at all — it
 * is how a ROW is identified, not how a listing is described) and the
 * boolean-cell vocabulary (`parseImportBooleanCell`, built in 9.11 and
 * deliberately left unwired until this validator existed to decide what a
 * malformed cell means: a row-level error, never a silent coercion).
 *
 * **Whole-file, not row-by-row**, and that is what makes the within-file
 * duplicate check possible: `externalReference.duplicateInFile` needs every
 * row's reference counted at once, which a function validating one row in
 * isolation could never see.
 */
export function validateImportRows(
  rows: readonly ImportRow[],
  curatedZones: readonly CuratedZone[],
  contact: ImportAccountContact,
  /**
   * Las filas **del archivo**, antes de que `applyResolvedLocations`
   * reemplace `ciudad`/`zona` por sus ids (tasks.md 9.29). Sólo las celdas
   * que se dibujan salen de acá; ninguna regla las mira. El valor por
   * defecto no miente: cuando nadie resolvió nada, la fila validada ES la
   * fila del archivo, que es el caso de cada prueba de este módulo.
   */
  sourceRows: readonly ImportRow[] = rows,
): ImportRowValidationOutcome {
  const referenceCounts = new Map<string, number>();
  for (const row of rows) {
    const reference = row.externalReference ?? "";
    if (reference === "") continue;
    referenceCounts.set(reference, (referenceCounts.get(reference) ?? 0) + 1);
  }

  const validRows: ValidImportRow[] = [];
  const errors: ImportRowError[] = [];

  rows.forEach((row, index) => {
    // The header is row 1 — the first data row is row 2, the number a
    // broker would find by opening the file in a spreadsheet. A row number
    // that counted only data rows (starting at 1) would point one row
    // short of where the mistake actually is.
    const rowNumber = index + 2;
    const reasons: ImportRowViolation[] = [];

    const externalReference = row.externalReference ?? "";
    if (externalReference === "") {
      reasons.push("externalReference.required");
    } else if ((referenceCounts.get(externalReference) ?? 0) > 1) {
      reasons.push("externalReference.duplicateInFile");
    }

    const booleanValues: Partial<Record<string, boolean>> = {};
    for (const field of BOOLEAN_FIELD_NAMES) {
      const parsed = parseImportBooleanCell(row[field] ?? "");
      if (!parsed.ok) {
        reasons.push(`${field}.invalid` as ImportRowViolation);
      } else if (parsed.value !== undefined) {
        booleanValues[field] = parsed.value;
      }
    }

    const draft: DraftListing = {
      publisherType: "broker",
      propertyType: orUndefined(row.propertyType) as DraftListing["propertyType"],
      title: row.title,
      description: row.description,
      priceUsd: parseOptionalNumber(row.priceUsd),
      cityId: orUndefined(row.city),
      zoneId: orUndefined(row.zone),
      contactMethod: contact.contactMethod,
      contactValue: contact.contactValue,
      rooms: parseOptionalNumber(row.rooms),
      areaM2: parseOptionalNumber(row.areaM2),
      bathrooms: parseOptionalNumber(row.bathrooms),
      parkingSpots: parseOptionalNumber(row.parkingSpots),
      hasPowerPlant: booleanValues.hasPowerPlant,
      hasRegularWater: booleanValues.hasRegularWater,
      isFurnished: booleanValues.isFurnished,
      hasSecurity: booleanValues.hasSecurity,
      hasAppliances: booleanValues.hasAppliances,
    };

    reasons.push(...validatePublishableListing(draft, curatedZones, "draft"));

    if (reasons.length > 0) {
      errors.push({
        rowNumber,
        reasons,
        cells: importRowCells(sourceRows[index] ?? row),
        offendingCells: offendingCellsFor(reasons),
      });
      return;
    }

    validRows.push({
      rowNumber,
      externalReference,
      listing: {
        publisherType: "broker",
        propertyType: draft.propertyType as PropertyType,
        title: draft.title as string,
        description: draft.description as string,
        priceUsd: draft.priceUsd as number,
        cityId: draft.cityId as string,
        zoneId: draft.zoneId as string,
        rooms: draft.rooms as number,
        areaM2: draft.areaM2 as number,
        bathrooms: draft.bathrooms as number,
        parkingSpots: draft.parkingSpots,
        hasPowerPlant: draft.hasPowerPlant,
        hasRegularWater: draft.hasRegularWater,
        isFurnished: draft.isFurnished,
        hasSecurity: draft.hasSecurity,
        hasAppliances: draft.hasAppliances,
        contactMethod: contact.contactMethod,
        contactValue: contact.contactValue,
      },
    });
  });

  return { validRows, errors };
}
