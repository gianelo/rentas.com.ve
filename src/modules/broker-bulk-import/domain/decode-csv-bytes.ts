/**
 * broker-bulk-import spec, Requirement: Encoding and Delimiter Tolerance
 * (tasks.md 9.6). "The system MUST require UTF-8 content and MUST reject a
 * file whose encoding cannot be decoded as UTF-8, with a message telling
 * the broker how to re-export."
 *
 * Strict decode, over bytes already resident in memory — this is CPU work,
 * not I/O, so it stays pure. `{ fatal: true }` is what makes the platform
 * `TextDecoder` throw on an invalid byte sequence instead of silently
 * substituting U+FFFD, which would turn a legacy-encoding file into
 * mangled-but-"successfully"-parsed rows instead of a clean refusal.
 */
export function decodeCsvBytesAsUtf8(bytes: Uint8Array): string | null {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}
