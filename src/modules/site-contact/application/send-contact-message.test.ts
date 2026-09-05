import { describe, expect, it } from "vitest";
import type { ContactMessageInput } from "../domain/contact-message";
import type { ContactMailerPort, ContactMessage } from "./ports/contact-mailer.port";
import { sendContactMessage } from "./send-contact-message";

/**
 * tasks.md 23.7 — the use case that wires validation to the outbound path.
 * A recording fake port, the same shape `in-memory-photo-hash.fake.ts` uses
 * for `PhotoHashPort`: no real Resend call, just proof of what this
 * function decided to send and when it decided to send nothing at all.
 */
class RecordingContactMailer implements ContactMailerPort {
  readonly sent: ContactMessage[] = [];

  async send(message: ContactMessage): Promise<void> {
    this.sent.push(message);
  }
}

function validInput(overrides: Partial<ContactMessageInput> = {}): ContactMessageInput {
  return {
    name: "María Pérez",
    email: "maria@example.com",
    message: "Hola, quería preguntar por un aviso que vi en Chacao la semana pasada.",
    honeypot: "",
    ...overrides,
  };
}

describe("sendContactMessage", () => {
  it("sends the composed notice and reports valid", async () => {
    const mailer = new RecordingContactMailer();

    const result = await sendContactMessage(validInput(), { mailer });

    expect(result).toEqual({ kind: "valid" });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.replyTo).toBe("maria@example.com");
  });

  it("never calls the mailer for an invalid submission", async () => {
    const mailer = new RecordingContactMailer();

    const result = await sendContactMessage(validInput({ message: "corto" }), { mailer });

    expect(result).toEqual({ kind: "invalid", violations: ["message-too-short"] });
    expect(mailer.sent).toHaveLength(0);
  });

  it("never calls the mailer for a honeypot-tripped submission", async () => {
    const mailer = new RecordingContactMailer();

    const result = await sendContactMessage(validInput({ honeypot: "https://spam.example" }), {
      mailer,
    });

    expect(result).toEqual({ kind: "spam" });
    expect(mailer.sent).toHaveLength(0);
  });
});
