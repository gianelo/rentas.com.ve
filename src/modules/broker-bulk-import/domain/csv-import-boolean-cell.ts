import { IMPORT_BOOLEAN_FALSE_VALUES, IMPORT_BOOLEAN_TRUE_VALUES } from "./csv-import-columns";

/**
 * The founder decision from `csv-import-columns.ts`, made executable: `si`/
 * `no` (also `1`/`0`), case-insensitive, trimmed. An empty cell means "not
 * specified" — `undefined`, not `false` — the same distinction
 * `publishable-listing.ts`'s `DraftListing` already draws for these five
 * attributes. A value outside that vocabulary is reported as unrecognised
 * rather than silently coerced: whether an unrecognised cell fails the
 * whole row is a decision for the per-row validator (tasks.md 9.15), not
 * this pure parser.
 */
export type BooleanCellParseResult =
  | { readonly ok: true; readonly value: boolean | undefined }
  | { readonly ok: false };

export function parseImportBooleanCell(raw: string): BooleanCellParseResult {
  const normalized = raw.trim().toLowerCase();

  if (normalized === "") {
    return { ok: true, value: undefined };
  }
  if (IMPORT_BOOLEAN_TRUE_VALUES.includes(normalized)) {
    return { ok: true, value: true };
  }
  if (IMPORT_BOOLEAN_FALSE_VALUES.includes(normalized)) {
    return { ok: true, value: false };
  }
  return { ok: false };
}
