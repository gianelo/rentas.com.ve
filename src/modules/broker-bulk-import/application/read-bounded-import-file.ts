import {
  checkFileSizeBound,
  checkRowCountBound,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_ROW_COUNT,
} from "../domain/csv-import-bounds";
import type { ImportFileSourcePort } from "./ports/import-file-source.port";

/**
 * broker-bulk-import spec, Requirement: Bounded Input Size (tasks.md
 * 9.8/9.9). design.md: "streaming parse, never load-all."
 *
 * **Two layers, on purpose.**
 *
 * 1. `declaredByteLength` is checked BEFORE `source.chunks()` is ever
 *    called — the strongest form of "refused without being read into
 *    memory first", since a `File`/`Blob`'s `.size` is known with zero
 *    bytes read.
 * 2. Actual bytes read and actual newlines seen are both tracked WHILE
 *    streaming, and either one aborts the `for await` loop the instant it
 *    is certain the bound is exceeded — this is what catches an oversized
 *    payload even if `declaredByteLength` lied (an untrusted client value),
 *    and it never buffers a rejected file to completion.
 *
 * **Row counting reads newline BYTES, not CSV fields — this is
 * deliberately NOT the CSV parser.** Counting `\n` occurrences is not
 * "parsing its contents" in the sense the spec means; the actual
 * delimiter-aware tokenizer (`csv-import-rows.ts`) never runs on a file
 * this function rejects. The domain's row parser treats every literal
 * newline as a row separator (documented there), which is exactly what
 * keeps this streaming count and the parser's eventual row count in
 * agreement — the threshold below is set to be certain-safe under a
 * trailing-newline-or-not ambiguity, not an approximation.
 */

export class ImportFileTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number = MAX_IMPORT_FILE_SIZE_BYTES) {
    super(
      `read-bounded-import-file: file exceeds the maximum size of 2 MB (${maxBytes} bytes). Split the portfolio into smaller files and upload each separately.`,
    );
    this.name = "ImportFileTooLargeError";
    this.maxBytes = maxBytes;
  }
}

export class ImportTooManyRowsError extends Error {
  readonly maxRows: number;

  constructor(maxRows: number = MAX_IMPORT_ROW_COUNT) {
    super(
      `read-bounded-import-file: file exceeds the maximum of 50 rows (limit: ${maxRows}). Split the portfolio into smaller files and upload each separately.`,
    );
    this.name = "ImportTooManyRowsError";
    this.maxRows = maxRows;
  }
}

const NEWLINE_BYTE = 0x0a;

/** Newlines beyond this are certain proof of exceeding MAX_IMPORT_ROW_COUNT
 * data rows regardless of whether the file ends with a trailing newline
 * (see module doc: N >= newlineCount - 1 always holds). */
const CERTAIN_ROW_OVERFLOW_NEWLINES = MAX_IMPORT_ROW_COUNT + 2;

export async function readBoundedImportFile(source: ImportFileSourcePort): Promise<Uint8Array> {
  const declaredSizeViolation = checkFileSizeBound(source.declaredByteLength);
  if (declaredSizeViolation) {
    throw new ImportFileTooLargeError();
  }

  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let newlineCount = 0;

  for await (const chunk of source.chunks()) {
    bytesRead += chunk.byteLength;
    if (checkFileSizeBound(bytesRead)) {
      throw new ImportFileTooLargeError();
    }

    for (const byte of chunk) {
      if (byte === NEWLINE_BYTE) {
        newlineCount += 1;
      }
    }
    if (newlineCount >= CERTAIN_ROW_OVERFLOW_NEWLINES) {
      throw new ImportTooManyRowsError();
    }

    chunks.push(chunk);
  }

  const total = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    total.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return total;
}

/** Re-exported so callers can apply the authoritative, post-parse row-count
 * check against the real parsed row count (see `parse-import-file.ts`). */
export { checkRowCountBound };
