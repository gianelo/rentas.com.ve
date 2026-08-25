import type { ImportHeaderColumns } from "./csv-import-header";
import type { ImportDelimiter } from "./csv-import-text";

/**
 * broker-bulk-import spec, Requirement: Accepted CSV Structure +
 * Requirement: Encoding and Delimiter Tolerance (tasks.md 9.5/9.10/9.11).
 *
 * **A row separator is always a literal newline — no field may embed one,
 * even quoted.** Documented at the top of the test file next to this. A
 * comma or semicolon INSIDE a quoted field is fully supported, including a
 * doubled `""` escaped quote.
 */

function parseCsvLine(line: string, delimiter: ImportDelimiter): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      fields.push(field);
      field = "";
      continue;
    }
    field += char;
  }

  fields.push(field);
  return fields;
}

/**
 * Splits already-decoded, already-BOM-stripped text into rows of raw string
 * cells. Line endings (`\n`, `\r\n`, lone `\r`) are all treated as row
 * separators; a single trailing blank line (the common "file ends with a
 * newline" artifact) is dropped.
 */
export function parseCsvRows(text: string, delimiter: ImportDelimiter): string[][] {
  const lines = text.split(/\r\n|\r|\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.map((line) => parseCsvLine(line, delimiter));
}

/**
 * `Record<string, string>`, not a typed `ImportRow` interface: this layer
 * has NOT validated or coerced a single value yet (numeric price, curated
 * zone, boolean vocabulary — tasks.md 9.12-9.15's job). What this function
 * guarantees is narrower and just as load-bearing: only an allowlisted
 * column's cell reaches the result, keyed by its canonical field name.
 * `publisher_type`, `status`, `expires_at`, `user_id` — or any future
 * column nobody has admitted yet — are dropped by construction, because
 * `columns.columnIndexByField` (built in `csv-import-header.ts`) never
 * contains an entry for them in the first place.
 */
export type ImportRow = Readonly<Record<string, string>>;

export function mapImportRow(columns: ImportHeaderColumns, rawRow: readonly string[]): ImportRow {
  const mapped: Record<string, string> = {};
  for (const [field, index] of columns.columnIndexByField) {
    mapped[field] = (rawRow[index] ?? "").trim();
  }
  return mapped;
}
