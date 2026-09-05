import { describe, expect, it } from "vitest";
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_MESSAGE_MIN_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  type ContactMessageInput,
  composeContactNotice,
  evaluateContactMessage,
} from "./contact-message";

/**
 * tasks.md 23.7 — the "Escribinos" form has no session and no per-listing
 * guard to lean on, unlike `reportListing`. Every rule this form needs
 * lives here: field validation, the honeypot's spam verdict, and the notice
 * composed for the mailer. Pure and I/O-free, like `resolveReportOutcome`.
 */

function validInput(overrides: Partial<ContactMessageInput> = {}): ContactMessageInput {
  return {
    name: "María Pérez",
    email: "maria@example.com",
    message: "Hola, quería preguntar por un aviso que vi en Chacao la semana pasada.",
    honeypot: "",
    ...overrides,
  };
}

describe("evaluateContactMessage", () => {
  it("accepts a well-formed submission", () => {
    expect(evaluateContactMessage(validInput())).toEqual({ kind: "valid" });
  });

  it("treats a filled honeypot as spam, before checking anything else", () => {
    // Every other field is ALSO broken here — an empty name, an invalid
    // email — and the verdict is still "spam", not "invalid": the trap
    // field is checked first and short-circuits the rest.
    const result = evaluateContactMessage(
      validInput({ name: "", email: "not-an-email", honeypot: "https://spam.example" }),
    );

    expect(result).toEqual({ kind: "spam" });
  });

  it("rejects an empty name", () => {
    const result = evaluateContactMessage(validInput({ name: "   " }));

    expect(result).toEqual({ kind: "invalid", violations: ["name-required"] });
  });

  it("rejects a name longer than the declared maximum", () => {
    const result = evaluateContactMessage(
      validInput({ name: "a".repeat(CONTACT_NAME_MAX_LENGTH + 1) }),
    );

    expect(result).toEqual({ kind: "invalid", violations: ["name-too-long"] });
  });

  it("rejects a name carrying a line break — a header-injection attempt, not a name", () => {
    const result = evaluateContactMessage(validInput({ name: "María\nBcc: victima@example.com" }));

    expect(result).toEqual({ kind: "invalid", violations: ["name-required"] });
  });

  it("rejects an email without an @ or a domain", () => {
    const result = evaluateContactMessage(validInput({ email: "no-arroba" }));

    expect(result).toEqual({ kind: "invalid", violations: ["email-invalid"] });
  });

  it("rejects an email carrying a line break", () => {
    const result = evaluateContactMessage(
      validInput({ email: "maria@example.com\r\nBcc: victima@example.com" }),
    );

    expect(result).toEqual({ kind: "invalid", violations: ["email-invalid"] });
  });

  it("rejects a message shorter than the declared minimum", () => {
    const result = evaluateContactMessage(validInput({ message: "hola" }));

    expect(result).toEqual({ kind: "invalid", violations: ["message-too-short"] });
  });

  it("rejects a message longer than the declared maximum", () => {
    const result = evaluateContactMessage(
      validInput({ message: "a".repeat(CONTACT_MESSAGE_MAX_LENGTH + 1) }),
    );

    expect(result).toEqual({ kind: "invalid", violations: ["message-too-long"] });
  });

  it("reports every broken field at once, not just the first", () => {
    const result = evaluateContactMessage(
      validInput({ name: "", email: "no-arroba", message: "" }),
    );

    expect(result).toEqual({
      kind: "invalid",
      violations: ["name-required", "email-invalid", "message-too-short"],
    });
  });

  it("accepts a message right at the minimum length, not one character over it", () => {
    const atMinimum = "a".repeat(CONTACT_MESSAGE_MIN_LENGTH);

    expect(evaluateContactMessage(validInput({ message: atMinimum }))).toEqual({ kind: "valid" });
  });
});

describe("composeContactNotice", () => {
  it("names the sender in the subject", () => {
    const notice = composeContactNotice(validInput({ name: "María Pérez" }));

    expect(notice.subject).toContain("María Pérez");
  });

  it("carries the trimmed message body through untouched", () => {
    const notice = composeContactNotice(validInput({ message: "  Hola, una pregunta.  " }));

    expect(notice.body).toContain("Hola, una pregunta.");
  });

  it("sets replyTo to the visitor's own address, so a reply reaches them", () => {
    const notice = composeContactNotice(validInput({ email: "maria@example.com" }));

    expect(notice.replyTo).toBe("maria@example.com");
  });
});
