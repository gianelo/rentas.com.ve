/**
 * contact-reveal spec, Requirement: Contact Hidden from Anonymous Visitors.
 *
 * The rule is one line of logic; what this file is actually for is the shape
 * of its result. `locked` has **no `value` property at all** rather than a
 * masked or empty one, so a render, a JSON response, or a server-component
 * payload physically cannot carry the contact to a visitor who has not
 * revealed it. A `{ value, visible: false }` shape would leak on the first
 * component that forgot to check the flag — and that leak is silent.
 *
 * Stated at its real strength: this makes the value *unrepresentable* in the
 * locked branch, it does not stop a caller from lying about `hasRevealed`.
 * Who has revealed what is decided by the reveal use case reading the event
 * log, never by the page.
 */

/**
 * How the publisher wants to be reached. Declared here rather than imported
 * from listing-publication or from the Drizzle schema, following this
 * codebase's existing convention for `PublisherType`: a domain states the
 * unions it reasons about, so the layer stays free of both another module's
 * domain and the ORM. The three sets are kept identical by the compiler at
 * every boundary that carries a value between them.
 */
export type ContactMethod = "whatsapp" | "telefono" | "email";

/**
 * The stored contact, as `listing.contact_method` / `listing.contact_value`
 * actually hold it (founder, 2026-08-18: "el valor que quiera mostrar la
 * persona. Sea email, WhatsApp o número de teléfono").
 */
export interface PublisherContact {
  readonly method: ContactMethod;
  readonly value: string;
}

/**
 * **The method survives the locked branch, the value does not.** That
 * asymmetry is the whole point of this type. `publishable-listing.ts` records
 * the rule it serves: "the reveal button's label comes from this, so a listing
 * that says 'Ver WhatsApp' while holding an address is a promise the product
 * does not keep." The label is drawn in the LOCKED state — before anyone has
 * revealed anything — so a shape that carried the method only once revealed
 * would guarantee the wrong word exactly where it is read most.
 *
 * The method is not sensitive: knowing an advert is contacted by email tells a
 * visitor nothing the "Ver email del dueño" button was not going to tell them
 * anyway. The value is, and it stays absent.
 */
export type ContactPresentation =
  | { readonly state: "locked"; readonly method: ContactMethod }
  | { readonly state: "revealed"; readonly method: ContactMethod; readonly value: string };

/**
 * `null` is the anonymous visitor. A signed-in viewer is only ever described
 * by what this decision needs — whether this pair has a reveal event — so the
 * domain stays free of any session type owned by another module.
 */
export interface ContactViewer {
  readonly hasRevealed: boolean;
}

export function presentContact(
  contact: PublisherContact,
  viewer: ContactViewer | null,
): ContactPresentation {
  if (!viewer?.hasRevealed) {
    return { state: "locked", method: contact.method };
  }

  return { state: "revealed", method: contact.method, value: contact.value };
}

/**
 * The channel's name, and only that: "Ver ___ del dueño" (SISTEMA.md screen 2)
 * is composed by whichever component draws the block.
 *
 * **The split is deliberate.** The sentence is copy and is being redesigned;
 * the rule that the word must name the channel actually stored is not, and it
 * belongs where the coverage floor can hold it. A `Record` rather than a
 * `switch` so adding a fourth method fails to compile here instead of falling
 * through to a default that quietly says the wrong thing.
 */
const CHANNEL_NOUN: Record<ContactMethod, string> = {
  whatsapp: "WhatsApp",
  telefono: "teléfono",
  email: "email",
};

export function contactChannelNoun(method: ContactMethod): string {
  return CHANNEL_NOUN[method];
}
