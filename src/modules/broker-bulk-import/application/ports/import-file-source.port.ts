/**
 * broker-bulk-import spec, Requirement: Bounded Input Size (tasks.md
 * 9.8/9.9) + design.md "CSV input bounds": "streaming parse, never
 * load-all."
 *
 * **`declaredByteLength` is what makes the size bound checkable BEFORE a
 * single byte is read.** A `File`/`Blob` from a multipart upload already
 * knows its own `.size` without being read — that is exactly what this
 * field is for. `chunks()` is the actual read, and it is an async
 * iterable on purpose: `read-bounded-import-file.ts` can `break` out of the
 * `for await` loop the moment a bound is crossed, so a caller never has to
 * finish reading a file it is about to reject.
 *
 * No infrastructure adapter ships in THIS slice (9.4-9.11 builds the
 * parser; wiring it to a real HTTP request body is 9.13-9.17's job). Tests
 * here use an in-memory fake — the whole point of a port.
 */
export interface ImportFileSourcePort {
  readonly declaredByteLength: number;
  chunks(): AsyncIterable<Uint8Array>;
}
