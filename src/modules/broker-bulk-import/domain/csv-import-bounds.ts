/**
 * broker-bulk-import spec, Requirement: Bounded Input Size (tasks.md
 * 9.8/9.9). "The system MUST enforce a maximum file size and a maximum row
 * count, both rejected before parsing begins."
 *
 * **Founder decision, not guessed:** 50 rows, 2 MB. Both enforced BEFORE
 * the file is parsed, and the refusal message must name the limit — a
 * broker with an 80-row portfolio has to learn to split the file, not stare
 * at a generic error.
 *
 * Pure, over numbers the application layer already knows from streaming
 * (`read-bounded-import-file.ts`) — this module never opens a file or a
 * stream itself, which is what keeps it trivially unit-testable and keeps
 * "pre-parse" an enforceable property rather than a comment.
 */

export const MAX_IMPORT_FILE_SIZE_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROW_COUNT = 50;

export type ImportBoundViolation =
  | { readonly kind: "fileTooLarge"; readonly maxBytes: number }
  | { readonly kind: "tooManyRows"; readonly maxRows: number };

export function checkFileSizeBound(byteLength: number): ImportBoundViolation | null {
  if (byteLength > MAX_IMPORT_FILE_SIZE_BYTES) {
    return { kind: "fileTooLarge", maxBytes: MAX_IMPORT_FILE_SIZE_BYTES };
  }
  return null;
}

export function checkRowCountBound(rowCount: number): ImportBoundViolation | null {
  if (rowCount > MAX_IMPORT_ROW_COUNT) {
    return { kind: "tooManyRows", maxRows: MAX_IMPORT_ROW_COUNT };
  }
  return null;
}
