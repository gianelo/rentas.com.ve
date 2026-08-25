/**
 * broker-bulk-import spec, "Generated CSV Output Is Not Executable" (tasks.md
 * 9.24/9.25) + design.md threat matrix, "Generated CSV output": "Leading
 * `=`, `+`, `-`, `@` neutralised in every emitted field... Formula-like
 * value exports inert."
 *
 * **The ONE place any downloadable CSV gets written.** The template
 * (`generate-import-template.ts`, tasks.md 9.25) and the future error
 * report both call `writeCsv` rather than re-implementing escaping — the
 * spec's own "including the template and any error report" phrase is what
 * this shared function is for. A second writer is a second place the two
 * could disagree about what is safe to hand a broker's spreadsheet.
 */

/**
 * The spec names four leading characters: `=`, `+`, `-`, `@` — each one a
 * documented way to make a spreadsheet application treat a cell as a
 * formula rather than text (`=` and `@` start a formula directly; `+` and
 * `-` are accepted by Excel as a formula prefix for compatibility with
 * Lotus 1-2-3 files).
 *
 * **TAB (`\t`) and CR (`\r`) are ALSO included, beyond the spec's own
 * four.** This follows the wider CSV-injection guidance the spec's own
 * threat-matrix row references: several spreadsheet import paths strip
 * LEADING whitespace-like control bytes before deciding what the first
 * "real" character of a cell is — a value stored as `\t=SUM(1,2)` can still
 * be read as a formula once the tab is silently skipped. Excluding them
 * would leave that variant open for a cost of nothing: neither byte is
 * meaningful content at the START of a text field, so treating them as
 * additional formula-trigger characters loses nothing a legitimate value
 * would ever want to keep.
 */
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * **A single leading apostrophe, never stripped back out on read.** This is
 * the same convention Excel itself uses to force a cell to text: opening the
 * neutralised file in Excel or Sheets shows the value with the apostrophe
 * invisible in the cell (it only appears in the formula bar), so a human
 * reading the file sees exactly the original text — it stays readable, not
 * merely inert.
 *
 * **Deliberately NOT undone by the parser.** `csv-import-rows.ts` (tasks.md
 * 9.11, already shipped and out of THIS slice's scope) reads a leading
 * apostrophe as a literal character like any other — it is not CSV syntax,
 * only a spreadsheet-application convention. A broker who re-uploads a
 * template row completely unchanged therefore stores that leading
 * apostrophe as part of the value. This is accepted rather than patched
 * around here: stripping it back out on read is a decision about every
 * future upload, not only the template's own round trip, and belongs to
 * whoever next touches `csv-import-rows.ts` with that guarantee in view —
 * not to a change scoped to the OUTPUT side.
 *
 * **Never over-neutralised.** A title genuinely beginning with `-` (a
 * broker's real "- Vista al mar, amoblado" listing) keeps every one of its
 * own characters — the prefix only ADDS one leading byte, it does not
 * rewrite or truncate anything after it.
 */
const NEUTRALISATION_PREFIX = "'";

export function neutraliseCsvField(value: string): string {
  const firstChar = value.charAt(0);
  if (FORMULA_TRIGGER_CHARS.has(firstChar)) {
    return `${NEUTRALISATION_PREFIX}${value}`;
  }
  return value;
}

/**
 * RFC4180 quoting: a field is wrapped in double quotes when it contains the
 * delimiter, a double quote, or a newline — and an internal double quote is
 * doubled per the same standard `csv-import-rows.ts`'s own parser already
 * reads back (`parseCsvLine`'s `""` -> `"` unescape).
 */
const NEEDS_QUOTING = /["\n\r,]/;

function quoteCsvField(value: string): string {
  if (!NEEDS_QUOTING.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function formatCsvField(value: string): string {
  return quoteCsvField(neutraliseCsvField(value));
}

function formatCsvRow(fields: readonly string[]): string {
  return fields.map(formatCsvField).join(",");
}

/**
 * A leading UTF-8 BOM is written on purpose — the same byte
 * `csv-import-text.ts`'s `stripBom` already tolerates on the READ side
 * (tasks.md 9.5). Excel needs it to render accented Spanish characters
 * (`á`, `é`, `ñ`) correctly instead of guessing a legacy locale encoding;
 * without it, a template downloaded and reopened in Excel on a
 * non-UTF-8-default Windows install shows garbled text on its own example
 * data.
 */
const UTF8_BOM = "﻿";

/**
 * Writes a full CSV document from rows of already-decoded string cells.
 * Every field passes through `neutraliseCsvField` before quoting, so a
 * caller can never forget the escaping step by handing it raw values.
 */
export function writeCsv(rows: readonly (readonly string[])[]): string {
  return UTF8_BOM + rows.map(formatCsvRow).join("\n");
}
