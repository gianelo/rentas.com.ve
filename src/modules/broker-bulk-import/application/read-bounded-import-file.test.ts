import { describe, expect, it } from "vitest";
import { MAX_IMPORT_FILE_SIZE_BYTES, MAX_IMPORT_ROW_COUNT } from "../domain/csv-import-bounds";
import type { ImportFileSourcePort } from "./ports/import-file-source.port";
import {
  ImportFileTooLargeError,
  ImportTooManyRowsError,
  readBoundedImportFile,
} from "./read-bounded-import-file";

/**
 * broker-bulk-import spec, Requirement: Bounded Input Size (tasks.md
 * 9.8/9.9). "A 40 MB file must be refused without being read into memory
 * first — that is the point of 'before its contents are parsed'."
 *
 * Every test here proves the SAME property two ways: the right error is
 * thrown, AND the source was not read to completion — the guarantee is
 * "never buffered", not just "eventually rejected".
 */

function textToChunks(text: string, chunkSize: number): Uint8Array[] {
  const bytes = new TextEncoder().encode(text);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(bytes.slice(i, i + chunkSize));
  }
  return chunks;
}

function fakeSource(
  chunks: readonly Uint8Array[],
  declaredByteLength: number,
): { source: ImportFileSourcePort; consumedChunks: () => number } {
  let consumed = 0;
  return {
    source: {
      declaredByteLength,
      async *chunks() {
        for (const chunk of chunks) {
          consumed += 1;
          yield chunk;
        }
      },
    },
    consumedChunks: () => consumed,
  };
}

describe("readBoundedImportFile — file size bound (tasks.md 9.8/9.9)", () => {
  it("refuses a file whose DECLARED size already exceeds the limit, WITHOUT reading a single chunk", async () => {
    const { source, consumedChunks } = fakeSource(
      [new TextEncoder().encode("this chunk must never be read")],
      MAX_IMPORT_FILE_SIZE_BYTES + 1,
    );

    await expect(readBoundedImportFile(source)).rejects.toThrow(ImportFileTooLargeError);
    expect(consumedChunks()).toBe(0);
  });

  it("names the 2 MB limit in the refusal message", async () => {
    const { source } = fakeSource([], MAX_IMPORT_FILE_SIZE_BYTES + 1);
    await expect(readBoundedImportFile(source)).rejects.toThrow(/2 MB/);
  });

  it("defends against a declared size that LIES: aborts mid-stream once actual bytes cross the limit", async () => {
    // Declares 10 bytes (passes the fast check) but actually streams a file
    // several times over the limit (the "40 MB upload" scenario) — proving
    // the abort happens well before the whole file would be consumed.
    const oversizedText = "x".repeat(MAX_IMPORT_FILE_SIZE_BYTES * 4);
    const chunks = textToChunks(oversizedText, 1024);
    const { source, consumedChunks } = fakeSource(chunks, 10);

    await expect(readBoundedImportFile(source)).rejects.toThrow(ImportFileTooLargeError);
    // Must abort around the 2 MB mark, leaving most of the ~4x-oversized
    // stream's chunks unconsumed — never buffers the whole file.
    expect(consumedChunks()).toBeLessThan(chunks.length / 2);
  });

  it("accepts a file at exactly the size limit", async () => {
    const text = "referencia_externa\nAB1";
    const chunks = textToChunks(text, 4);
    const { source } = fakeSource(chunks, new TextEncoder().encode(text).byteLength);

    const bytes = await readBoundedImportFile(source);
    expect(new TextDecoder().decode(bytes)).toBe(text);
  });
});

describe("readBoundedImportFile — row count bound (tasks.md 9.8/9.9)", () => {
  it("refuses a file whose row count exceeds the limit, aborting mid-stream", async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROW_COUNT + 30 }, (_, i) => `ref${i};titulo${i}`);
    const text = `referencia_externa;titulo\n${rows.join("\n")}\n`;
    const chunks = textToChunks(text, 32);
    const { source, consumedChunks } = fakeSource(
      chunks,
      new TextEncoder().encode(text).byteLength,
    );

    await expect(readBoundedImportFile(source)).rejects.toThrow(ImportTooManyRowsError);
    expect(consumedChunks()).toBeLessThan(chunks.length);
  });

  it("names the 50-row limit in the refusal message", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => `ref${i}`);
    const text = `referencia_externa\n${rows.join("\n")}\n`;
    const { source } = fakeSource(
      textToChunks(text, 32),
      new TextEncoder().encode(text).byteLength,
    );

    await expect(readBoundedImportFile(source)).rejects.toThrow(/50/);
  });

  it("accepts a file with exactly the maximum row count", async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROW_COUNT }, (_, i) => `ref${i}`);
    const text = `referencia_externa\n${rows.join("\n")}`;
    const chunks = textToChunks(text, 16);
    const { source } = fakeSource(chunks, new TextEncoder().encode(text).byteLength);

    const bytes = await readBoundedImportFile(source);
    expect(new TextDecoder().decode(bytes)).toBe(text);
  });
});
