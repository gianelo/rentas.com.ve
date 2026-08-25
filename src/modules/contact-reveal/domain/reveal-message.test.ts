import { describe, expect, it } from "vitest";
import { MissingRevealMessageError, requireRevealMessage } from "./reveal-message";

describe("requireRevealMessage", () => {
  it.each([null, undefined, "", "   ", "\n\t "])(
    "refuses a blank or whitespace-only message (%j)",
    (raw) => {
      expect(() => requireRevealMessage(raw)).toThrow(MissingRevealMessageError);
    },
  );

  it("keeps the message exactly as submitted, without trimming it", () => {
    // The database CHECK constraint uses btrim only to decide "blank or not"
    // (tasks.md 6.11); the stored text must survive untouched, because the
    // spec calls it "the authoritative record of what the tenant wrote".
    expect(requireRevealMessage("  Hola, me interesa  ")).toBe("  Hola, me interesa  ");
  });
});
