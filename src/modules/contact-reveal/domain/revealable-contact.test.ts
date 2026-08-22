import { describe, expect, it } from "vitest";
import { type PublisherContact, presentContact } from "./revealable-contact";

const WHATSAPP: PublisherContact = { method: "whatsapp", value: "+58 412 555 0134" };
const EMAIL: PublisherContact = { method: "email", value: "duenio@ejemplo.com" };

describe("presentContact", () => {
  // contact-reveal spec, Requirement: Contact Hidden from Anonymous Visitors —
  // "Anonymous visitor sees no contact value". The assertion that matters is
  // not that `state` reads "locked": it is that the returned value carries no
  // number at all. A placeholder still holding the contact one field away is
  // leaked the moment anything serialises it into the page.
  it("gives an anonymous visitor a placeholder that does not carry the value", () => {
    const presentation = presentContact(WHATSAPP, null);

    expect(presentation).toEqual({ state: "locked", method: "whatsapp" });
    expect(JSON.stringify(presentation)).not.toContain("0134");
  });

  it("keeps the contact hidden from a signed-in visitor who has not revealed it", () => {
    // Signing in is not the reveal. The event log is the north-star metric
    // (design.md D6); a session that unlocked the number by itself would
    // record nothing — it would not inflate the metric, it would blind it.
    const presentation = presentContact(WHATSAPP, { hasRevealed: false });

    expect(presentation).toEqual({ state: "locked", method: "whatsapp" });
    expect(JSON.stringify(presentation)).not.toContain("0134");
  });

  it("shows the value to a signed-in visitor who has revealed it", () => {
    expect(presentContact(WHATSAPP, { hasRevealed: true })).toEqual({
      state: "revealed",
      method: "whatsapp",
      value: "+58 412 555 0134",
    });
  });

  /**
   * **The defect this shape exists to prevent.** `publishable-listing.ts`
   * states the rule plainly: "the reveal button's label comes from this, so a
   * listing that says 'Ver WhatsApp' while holding an address is a promise
   * the product does not keep." The method therefore has to survive the LOCKED
   * branch too — the locked block is exactly where the label is drawn, before
   * anyone has revealed anything.
   */
  it("carries the method into the locked state, not only the revealed one", () => {
    expect(presentContact(EMAIL, null)).toEqual({ state: "locked", method: "email" });
    expect(presentContact(EMAIL, { hasRevealed: false })).toEqual({
      state: "locked",
      method: "email",
    });
  });

  it("never substitutes a method the listing does not hold", () => {
    // One `expect` per method, so a wrong-channel label fails as its own case
    // rather than hiding inside a loop's last iteration.
    expect(presentContact({ method: "telefono", value: "0212 555 0134" }, null)).toEqual({
      state: "locked",
      method: "telefono",
    });
    expect(presentContact(EMAIL, { hasRevealed: true })).toEqual({
      state: "revealed",
      method: "email",
      value: "duenio@ejemplo.com",
    });
  });
});

describe("contactChannelNoun", () => {
  /**
   * **The noun, not the sentence.** This returns "WhatsApp" / "teléfono" /
   * "email" and nothing else, so the copy around it ("Ver ___ del dueño",
   * SISTEMA.md screen 2) stays in the component that draws it. That split is
   * deliberate: the wording is being redesigned, the RULE that the word must
   * name the channel actually stored is not.
   */
  it("names the channel the listing actually holds", async () => {
    const { contactChannelNoun } = await import("./revealable-contact");

    expect(contactChannelNoun("whatsapp")).toBe("WhatsApp");
    expect(contactChannelNoun("telefono")).toBe("teléfono");
    expect(contactChannelNoun("email")).toBe("email");
  });
});
