/**
 * contact-reveal spec, Requirement: Contact Hidden from Anonymous Visitors.
 *
 * The rule is one line of logic; what this file is actually for is the shape
 * of its result. `locked` has **no `whatsapp` property at all** rather than a
 * masked or empty one, so a render, a JSON response, or a server-component
 * payload physically cannot carry the number to a visitor who has not
 * revealed it. A `{ whatsapp, visible: false }` shape would leak on the first
 * component that forgot to check the flag — and that leak is silent.
 *
 * Stated at its real strength: this makes the value *unrepresentable* in the
 * locked branch, it does not stop a caller from lying about `hasRevealed`.
 * Who has revealed what is decided by the reveal use case reading the event
 * log, never by the page.
 */
export type ContactPresentation =
  | { readonly state: "locked" }
  | { readonly state: "revealed"; readonly whatsapp: string };

/**
 * `null` is the anonymous visitor. A signed-in viewer is only ever described
 * by what this decision needs — whether this pair has a reveal event — so the
 * domain stays free of any session type owned by another module.
 */
export interface ContactViewer {
  readonly hasRevealed: boolean;
}

export function presentContact(
  whatsapp: string,
  viewer: ContactViewer | null,
): ContactPresentation {
  if (!viewer?.hasRevealed) {
    return { state: "locked" };
  }

  return { state: "revealed", whatsapp };
}
