/**
 * Task 6.12/6.13 — a reveal now costs the tenant a written message to the
 * publisher (design.md, Open Questions: "Contact-reveal rate limit
 * threshold", RESOLVED 2026-08-24). Blank or whitespace-only input is
 * refused with the same rule the `NOT VALID` CHECK constraint on
 * `contact_reveal_event.message` enforces at the database (drizzle migration
 * for tasks.md 6.11): `length(btrim(message)) > 0`. The domain and the
 * constraint agree on what "a message" means, so a bug here cannot silently
 * disagree with the backstop the database provides.
 *
 * **The stored value is the original submission, not the trimmed one.** The
 * spec requires the event to hold "the message exactly as submitted" — trim
 * decides whether it is blank, it never rewrites what the tenant actually
 * wrote.
 */
export class MissingRevealMessageError extends Error {
  constructor() {
    super("reveal-contact: a message to the publisher is required to reveal contact.");
    this.name = "MissingRevealMessageError";
  }
}

export function requireRevealMessage(raw: string | null | undefined): string {
  const value = raw ?? "";

  if (value.trim().length === 0) {
    throw new MissingRevealMessageError();
  }

  return value;
}
