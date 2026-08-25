import { describe, expect, it } from "vitest";
import { decodeCsvBytesAsUtf8 } from "./decode-csv-bytes";

/**
 * broker-bulk-import spec, Requirement: Encoding and Delimiter Tolerance
 * (tasks.md 9.6). "The system MUST require UTF-8 content and MUST reject a
 * file whose encoding cannot be decoded as UTF-8." Pure over bytes already
 * in memory — no file I/O here, just strict decoding.
 */

describe("decodeCsvBytesAsUtf8", () => {
  it("decodes valid UTF-8 bytes, including accented characters", () => {
    const bytes = new TextEncoder().encode("referencia_externa;título;habitación");
    expect(decodeCsvBytesAsUtf8(bytes)).toBe("referencia_externa;título;habitación");
  });

  it("decodes an empty buffer as an empty string", () => {
    expect(decodeCsvBytesAsUtf8(new Uint8Array())).toBe("");
  });

  it("returns null for a byte sequence that cannot be decoded as UTF-8", () => {
    // 0xC3 begins a two-byte UTF-8 sequence but is not followed by a valid
    // continuation byte — this is exactly the shape a legacy Windows-1252
    // export of "título" (0xF3 for "ó") produces.
    const invalidUtf8 = Uint8Array.from([0x74, 0xed, 0x74, 0x75, 0x6c, 0x6f]);
    expect(decodeCsvBytesAsUtf8(invalidUtf8)).toBeNull();
  });

  it("returns null for a lone continuation byte with no lead byte", () => {
    const invalidUtf8 = Uint8Array.from([0x80, 0x80]);
    expect(decodeCsvBytesAsUtf8(invalidUtf8)).toBeNull();
  });
});
