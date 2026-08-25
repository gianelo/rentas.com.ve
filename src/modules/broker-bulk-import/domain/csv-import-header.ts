import {
  IMPORT_COLUMN_ALLOWLIST,
  REQUIRED_IMPORT_COLUMNS,
  type RequiredImportColumn,
} from "./csv-import-columns";

/**
 * broker-bulk-import spec, Requirement: Accepted CSV Structure (tasks.md
 * 9.4). "The system MUST require a header row and MUST accept columns in
 * any order. The system MUST require the columns
 * `referencia_externa, titulo, descripcion, precio_usd, ciudad, zona`."
 *
 * A missing required column rejects the WHOLE file — nothing here parses a
 * single data row until the header itself is proven complete.
 */

export interface ImportHeaderColumns {
  /** Canonical field name -> the raw row's column index. Unrecognised
   * headers never get an entry: that IS the allowlist (tasks.md 9.11). */
  readonly columnIndexByField: ReadonlyMap<string, number>;
}

export type HeaderValidationResult =
  | { readonly ok: true; readonly columns: ImportHeaderColumns }
  | { readonly ok: false; readonly missingColumns: readonly RequiredImportColumn[] };

function normalise(header: string): string {
  return header.trim().toLowerCase();
}

export function validateImportHeader(headerRow: readonly string[]): HeaderValidationResult {
  const normalisedHeader = headerRow.map(normalise);

  const missingColumns = REQUIRED_IMPORT_COLUMNS.filter(
    (column) => !normalisedHeader.includes(column),
  );
  if (missingColumns.length > 0) {
    return { ok: false, missingColumns };
  }

  const columnIndexByField = new Map<string, number>();
  for (const definition of IMPORT_COLUMN_ALLOWLIST) {
    const index = normalisedHeader.indexOf(definition.header);
    if (index !== -1) {
      columnIndexByField.set(definition.field, index);
    }
  }

  return { ok: true, columns: { columnIndexByField } };
}
