/**
 * "Escribinos" — the visitor-facing contact form (tasks.md 23.7, DECIDIDA
 * 2026-09-04).
 *
 * **A form, not a `mailto:`, decided for exactly two reasons the task text
 * names**: it does not expose an address to scrapers, and it works for a
 * visitor with no mail client configured. This file is the whole "input
 * validation" half of what that decision obliges — the other half, "spam
 * protection", is the honeypot check below, and "a new outbound path" is
 * `infrastructure/resend-contact-mailer.ts`.
 *
 * Pure and I/O-free, like `resolveReportOutcome` and `evaluateRevealAllowance`:
 * it takes what the form posted and answers one question — is this safe to
 * send, and if not, why.
 */

export const CONTACT_NAME_MAX_LENGTH = 80;
export const CONTACT_MESSAGE_MIN_LENGTH = 20;
export const CONTACT_MESSAGE_MAX_LENGTH = 2000;

export type ContactMessageViolation =
  | "name-required"
  | "name-too-long"
  | "email-invalid"
  | "message-too-short"
  | "message-too-long";

export interface ContactMessageInput {
  readonly name: string;
  readonly email: string;
  readonly message: string;
  /**
   * The trap field (`app/ayuda/escribinos/page.tsx` hides it with CSS and
   * `aria-hidden`, so no real visitor — sighted, keyboard, or screen-reader
   * — ever reaches it). A script that fills every field it can find fills
   * this one too; a person never does.
   */
  readonly honeypot: string;
}

export type ContactMessageEvaluation =
  | { readonly kind: "valid" }
  | { readonly kind: "invalid"; readonly violations: readonly ContactMessageViolation[] }
  | { readonly kind: "spam" };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Header-injection guard (AGENTS.md §7 — fail closed). `name`/`email` end up
 * inside the email `composeContactNotice` builds — the subject line and the
 * `replyTo` header. A `\r` or `\n` smuggled into either could splice a second
 * header (a `Bcc:`, say) into what Resend sends; rejecting the line break
 * here is cheaper than escaping it later, and it never disguises itself as a
 * legitimate name or address.
 */
const HAS_LINE_BREAK = /[\r\n]/;

/**
 * **The honeypot is checked first and reported apart from real violations.**
 * A script that fills every field gets one verdict — spam — never "spam AND
 * also forgot the message", which would leak how the form parses to whoever
 * is probing it.
 */
export function evaluateContactMessage(input: ContactMessageInput): ContactMessageEvaluation {
  if (input.honeypot.trim() !== "") return { kind: "spam" };

  const violations: ContactMessageViolation[] = [];

  const name = input.name.trim();
  if (name === "" || HAS_LINE_BREAK.test(input.name)) {
    violations.push("name-required");
  } else if (name.length > CONTACT_NAME_MAX_LENGTH) {
    violations.push("name-too-long");
  }

  const email = input.email.trim();
  if (!EMAIL_PATTERN.test(email) || HAS_LINE_BREAK.test(input.email)) {
    violations.push("email-invalid");
  }

  const message = input.message.trim();
  if (message.length < CONTACT_MESSAGE_MIN_LENGTH) {
    violations.push("message-too-short");
  } else if (message.length > CONTACT_MESSAGE_MAX_LENGTH) {
    violations.push("message-too-long");
  }

  return violations.length > 0 ? { kind: "invalid", violations } : { kind: "valid" };
}

export interface ContactNotice {
  readonly subject: string;
  readonly body: string;
  /** The visitor's own address, so hitting "reply" in a mail client reaches them
   *  and not the sender identity the port sends `from`. */
  readonly replyTo: string;
}

/**
 * **Only meaningful after `evaluateContactMessage` returned `"valid"`.**
 * Composing off unvalidated input would carry a `\r\n`-bearing value straight
 * into a header; this function trusts its caller to have checked first,
 * exactly like `composeMagicLinkEmail` trusts the token it is handed.
 */
export function composeContactNotice(input: ContactMessageInput): ContactNotice {
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();

  return {
    subject: `Escribinos: mensaje de ${name}`,
    body: `${name} <${email}> escribió desde "Escribinos":\n\n${message}`,
    replyTo: email,
  };
}
