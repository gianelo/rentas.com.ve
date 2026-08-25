/**
 * broker-bulk-import spec, "Downloadable Template as the Format Contract" +
 * "Accepted CSV Structure" (tasks.md 9.4/9.10/9.11).
 *
 * **This is the one place the column set is written down.** The parser
 * (this file's consumers) and the template generator (tasks.md 9.25, not
 * built yet) both read this array — neither restates it — which is exactly
 * what the spec's "Template matches the parser" scenario requires: change a
 * column here and both sides move together, because there is only one side.
 *
 * **16 columns, not the spec's 6.** The spec's own "Accepted CSV Structure"
 * requirement names 6 required columns. The founder asked for everything the
 * publish flow can already store, and every optional column below is
 * confirmed present on `listing` (see `publishable-listing.ts`,
 * `listing-repository.port.ts`). The five booleans are the F6 attributes a
 * broker already knows by heart for their whole portfolio — without an
 * allowlist entry here, nothing short of hand-editing fifty rows lets them
 * declare a generator or a security guard.
 *
 * **Contact is deliberately absent.** `listing.contact_method` and
 * `listing.contact_value` are the account's default, copied at publish time
 * — never the file's. A `contact_method`/`contact_value` column in an
 * uploaded file is not a recognised header, so it is dropped exactly like
 * `publisher_type`, `status`, `expires_at`, or `user_id` (tasks.md 9.10).
 */

export type RequiredImportColumn =
  | "referencia_externa"
  | "titulo"
  | "descripcion"
  | "precio_usd"
  | "ciudad"
  | "zona";

export type OptionalImportColumn =
  | "tipo_inmueble"
  | "habitaciones"
  | "banos"
  | "metros2"
  | "estacionamientos"
  | "planta_electrica"
  | "agua_regular"
  | "amoblado"
  | "vigilancia"
  | "linea_blanca";

export type ImportColumnHeader = RequiredImportColumn | OptionalImportColumn;

export interface ImportColumnDefinition {
  readonly header: ImportColumnHeader;
  /** Canonical field name, matching this codebase's existing camelCase names. */
  readonly field: string;
  readonly required: boolean;
}

/**
 * Order here is the order the template (9.25) writes columns in. Column
 * ORDER in an uploaded file must not matter (spec, "Accepted CSV
 * Structure") — this array's order is a display choice, not a parsing rule.
 */
export const IMPORT_COLUMN_ALLOWLIST: readonly ImportColumnDefinition[] = [
  { header: "referencia_externa", field: "externalReference", required: true },
  { header: "titulo", field: "title", required: true },
  { header: "descripcion", field: "description", required: true },
  { header: "precio_usd", field: "priceUsd", required: true },
  { header: "ciudad", field: "city", required: true },
  { header: "zona", field: "zone", required: true },
  { header: "tipo_inmueble", field: "propertyType", required: false },
  { header: "habitaciones", field: "rooms", required: false },
  { header: "banos", field: "bathrooms", required: false },
  { header: "metros2", field: "areaM2", required: false },
  { header: "estacionamientos", field: "parkingSpots", required: false },
  { header: "planta_electrica", field: "hasPowerPlant", required: false },
  { header: "agua_regular", field: "hasRegularWater", required: false },
  { header: "amoblado", field: "isFurnished", required: false },
  { header: "vigilancia", field: "hasSecurity", required: false },
  { header: "linea_blanca", field: "hasAppliances", required: false },
] as const;

export const REQUIRED_IMPORT_COLUMNS: readonly RequiredImportColumn[] =
  IMPORT_COLUMN_ALLOWLIST.filter((column) => column.required).map(
    (column) => column.header as RequiredImportColumn,
  );

/**
 * The five F6 attributes, isolated so the row mapper (9.11) and the future
 * per-row validator (9.15) both know which columns carry the si/no vocabulary
 * below rather than plain text.
 */
export const IMPORT_BOOLEAN_COLUMNS: ReadonlySet<OptionalImportColumn> = new Set([
  "planta_electrica",
  "agua_regular",
  "amoblado",
  "vigilancia",
  "linea_blanca",
]);

/**
 * Founder decision (this slice, tasks.md 9.10/9.11): a boolean cell is
 * written as `si`/`no`, case-insensitive and trimmed — the word a Venezuelan
 * broker would actually type — with `1`/`0` accepted too, because a
 * spreadsheet saved from a Spanish locale will not write the English
 * `true`/`false` LibreOffice/Excel expect for a native boolean cell, and a
 * plain text cell is exactly what a CSV column is. Both are documented here,
 * consumed by `parseImportBooleanCell` (`import-boolean-cell.ts`), so a
 * future validator never re-invents the vocabulary.
 */
export const IMPORT_BOOLEAN_TRUE_VALUES: readonly string[] = ["si", "1"];
export const IMPORT_BOOLEAN_FALSE_VALUES: readonly string[] = ["no", "0"];
