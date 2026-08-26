/**
 * broker-bulk-import spec, Requirement: Encoding and Delimiter Tolerance
 * (tasks.md 9.5/9.7). Pure text-level helpers — the bytes are already
 * decoded to a string by the time anything here runs (`decode-csv-bytes.ts`
 * owns the byte layer).
 */

export const UTF8_BOM = "﻿";

/**
 * Strips a leading UTF-8 BOM. This has to run BEFORE header validation:
 * without it, the first column name silently reads as `﻿referencia_externa`
 * and the file is rejected for a "missing" column that is right there.
 */
export function stripBom(text: string): string {
  return text.startsWith(UTF8_BOM) ? text.slice(1) : text;
}

export type ImportDelimiter = "," | ";";

/**
 * Counts a delimiter candidate OUTSIDE quoted regions, so a comma inside a
 * quoted field (`"Casa, moderna"`) never tips the count toward comma on a
 * genuinely semicolon-delimited file.
 */
function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

/**
 * Detects `,` vs `;` from a single line (the header row). Spanish-locale
 * spreadsheets export `;` because `,` is the decimal separator there — this
 * is the ordinary case, not the exotic one. Ties (including "neither
 * present") default to comma, the RFC 4180 default.
 */
export function sniffDelimiter(line: string): ImportDelimiter {
  const commaCount = countDelimiterOutsideQuotes(line, ",");
  const semicolonCount = countDelimiterOutsideQuotes(line, ";");
  return semicolonCount > commaCount ? ";" : ",";
}
