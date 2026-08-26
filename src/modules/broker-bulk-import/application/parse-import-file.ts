import { checkRowCountBound, MAX_IMPORT_ROW_COUNT } from "../domain/csv-import-bounds";
import type { RequiredImportColumn } from "../domain/csv-import-columns";
import { validateImportHeader } from "../domain/csv-import-header";
import { type ImportRow, mapImportRow, parseCsvRows } from "../domain/csv-import-rows";
import { sniffDelimiter, stripBom } from "../domain/csv-import-text";
import { decodeCsvBytesAsUtf8 } from "../domain/decode-csv-bytes";
import type { ImportFileSourcePort } from "./ports/import-file-source.port";
import { ImportTooManyRowsError, readBoundedImportFile } from "./read-bounded-import-file";

/**
 * broker-bulk-import spec: "Downloadable Template as the Format Contract",
 * "Accepted CSV Structure", "Encoding and Delimiter Tolerance", "Bounded
 * Input Size" (tasks.md 9.4-9.11).
 *
 * **The one place the pieces compose**, same idiom as `publish-listing.ts`
 * ("the only place the four pieces meet"): the streaming bound-checked read,
 * the strict decode, the BOM/delimiter handling, the header contract, and
 * the strict-allowlist row mapping each already carry their own proof
 * in isolation. What is decided HERE is the order they run in:
 *
 * 1. Streaming bound check (size, then a fast newline-count pass) — never
 *    buffers a grossly oversized file.
 * 2. Strict UTF-8 decode — refuses before a single field is read.
 * 3. BOM strip, THEN delimiter sniff, THEN row split — in that order,
 *    because sniffing before stripping would count a BOM'd first column
 *    wrong on some inputs.
 * 4. Header validation against the allowlist — a missing required column
 *    stops here, before any data row is mapped.
 * 5. An AUTHORITATIVE row-count check against the real parsed row count —
 *    `read-bounded-import-file.ts`'s streaming check is certain-safe but
 *    can, at the exact boundary (e.g. 51 rows with no trailing newline),
 *    let a file through that this final check still catches.
 * 6. Strict-allowlist row mapping — unrecognised columns were never even
 *    added to the header's column-index map, so they cannot reach a row.
 *
 * This slice does NOT validate a single cell's business meaning (numeric
 * price, curated zone, boolean vocabulary) — that is `ValidateImportUseCase`
 * (tasks.md 9.12-9.15), not built yet. What this function guarantees is
 * STRUCTURAL: the right columns, the right rows, nothing more.
 */

export class ImportEncodingError extends Error {
  constructor() {
    super(
      'parse-import-file: the file could not be decoded as UTF-8. Re-export it as "CSV UTF-8" from your spreadsheet application (Excel: File > Save As > CSV UTF-8; Google Sheets: File > Download > Comma Separated Values).',
    );
    this.name = "ImportEncodingError";
  }
}

export class ImportMissingColumnsError extends Error {
  readonly missingColumns: readonly RequiredImportColumn[];

  constructor(missingColumns: readonly RequiredImportColumn[]) {
    super(
      `parse-import-file: the file is missing required column(s): ${missingColumns.join(", ")}. Download the template and compare the header row.`,
    );
    this.name = "ImportMissingColumnsError";
    this.missingColumns = missingColumns;
  }
}

export interface ParsedImportFile {
  readonly rows: readonly ImportRow[];
}

export async function parseImportFile(source: ImportFileSourcePort): Promise<ParsedImportFile> {
  const bytes = await readBoundedImportFile(source);

  const decoded = decodeCsvBytesAsUtf8(bytes);
  if (decoded === null) {
    throw new ImportEncodingError();
  }

  const text = stripBom(decoded);
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] ?? "";
  const delimiter = sniffDelimiter(firstLine);

  const allRows = parseCsvRows(text, delimiter);
  const [header, ...dataRows] = allRows;

  const headerResult = validateImportHeader(header ?? []);
  if (!headerResult.ok) {
    throw new ImportMissingColumnsError(headerResult.missingColumns);
  }

  const rowCountViolation = checkRowCountBound(dataRows.length);
  if (rowCountViolation) {
    throw new ImportTooManyRowsError(MAX_IMPORT_ROW_COUNT);
  }

  const rows = dataRows.map((rawRow) => mapImportRow(headerResult.columns, rawRow));

  return { rows };
}
