import { describe, expect, it } from "vitest";
import { presentContact } from "./revealable-contact";

const WHATSAPP = "+58 412 555 0134";

describe("presentContact", () => {
  // contact-reveal spec, Requirement: Contact Hidden from Anonymous Visitors —
  // "Anonymous visitor sees no contact value". The assertion that matters is
  // not that `state` reads "locked": it is that the returned value carries no
  // number at all. A placeholder still holding the contact one field away is
  // leaked the moment anything serialises it into the page.
  it("gives an anonymous visitor a placeholder that does not carry the number", () => {
    const presentation = presentContact(WHATSAPP, null);

    expect(presentation).toEqual({ state: "locked" });
    expect(JSON.stringify(presentation)).not.toContain("0134");
  });

  it("keeps the contact hidden from a signed-in visitor who has not revealed it", () => {
    // Signing in is not the reveal. The event log is the north-star metric
    // (design.md D6); a session that unlocked the number by itself would
    // record nothing — it would not inflate the metric, it would blind it.
    const presentation = presentContact(WHATSAPP, { hasRevealed: false });

    expect(presentation).toEqual({ state: "locked" });
    expect(JSON.stringify(presentation)).not.toContain("0134");
  });

  it("shows the number to a signed-in visitor who has revealed it", () => {
    expect(presentContact(WHATSAPP, { hasRevealed: true })).toEqual({
      state: "revealed",
      whatsapp: WHATSAPP,
    });
  });
});
