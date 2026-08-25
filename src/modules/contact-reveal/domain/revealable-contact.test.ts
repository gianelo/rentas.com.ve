import { describe, expect, it } from "vitest";
import {
  contactActionHref,
  type PublisherContact,
  presentContact,
  presentListingContact,
} from "./revealable-contact";

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

  // tasks.md 6.14 — the message rides along with the revealed state when the
  // caller knows it, so `contactActionHref` can carry it instead of a fixed
  // sentence. Absent when the caller does not know it: this must never widen
  // what a locked visitor can see, only what a revealed one carries further.
  it("carries the message along on the revealed state when the caller provides one", () => {
    expect(presentContact(WHATSAPP, { hasRevealed: true, message: "Hola, me interesa" })).toEqual({
      state: "revealed",
      method: "whatsapp",
      value: "+58 412 555 0134",
      message: "Hola, me interesa",
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

describe("presentListingContact", () => {
  /**
   * **Un aviso vencido no tiene contacto en NINGÚN estado de sesión**, y por
   * eso la guarda va antes que el lector. Escrita al revés — mirar primero si
   * reveló y después si venció — un inquilino con sesión seguiría viendo el
   * número de un aviso que ya no está en pie, que es exactamente lo que la
   * ficha vencida dice en voz alta que no hace.
   */
  it.each([null, { hasRevealed: false }, { hasRevealed: true }])(
    "no entrega contacto de un aviso vencido, mire quien mire (%o)",
    (viewer) => {
      const presentation = presentListingContact(
        { method: "whatsapp", availability: "expired", value: "+58 412 555 0134" },
        viewer,
      );

      expect(presentation).toEqual({ state: "expired" });
      expect(JSON.stringify(presentation)).not.toContain("0134");
    },
  );

  /**
   * **`value: null` no es un caso raro: es el camino normal.** Quien llega de
   * Google no tiene sesión, así que la ficha nunca le pide el valor a
   * Postgres — y esta rama es la que deja que "no leerlo" siga siendo un
   * estado legítimo en vez de un `undefined` que se cuela hasta el render.
   */
  it("queda bloqueado cuando el valor no se leyó", () => {
    expect(
      presentListingContact({ method: "whatsapp", availability: "available", value: null }, null),
    ).toEqual({ state: "locked", method: "whatsapp" });
  });

  it("sigue bloqueado si el valor se leyó pero nadie reveló", () => {
    // La defensa en el otro sentido: tener el valor a mano no es permiso.
    expect(
      presentListingContact(
        { method: "whatsapp", availability: "available", value: "+58 412 555 0134" },
        { hasRevealed: false },
      ),
    ).toEqual({ state: "locked", method: "whatsapp" });
  });

  it("entrega el valor a quien reveló un aviso vigente", () => {
    expect(
      presentListingContact(
        { method: "email", availability: "available", value: "duenio@ejemplo.com" },
        { hasRevealed: true },
      ),
    ).toEqual({ state: "revealed", method: "email", value: "duenio@ejemplo.com" });
  });
});

describe("contactActionHref", () => {
  /**
   * **Tres métodos, tres acciones, y ningún `if` escrito a mano.** Es la misma
   * razón por la que `CHANNEL_NOUN` es un `Record`: un cuarto método tiene que
   * romper la compilación acá, no caer en un `default` que abra la aplicación
   * equivocada.
   */
  it("abre wa.me para WhatsApp, tel: para teléfono y mailto: para email", () => {
    expect(contactActionHref("whatsapp", "+58 412 555 0134", "Hola")).toMatch(
      /^https:\/\/wa\.me\/584125550134\?text=/,
    );
    expect(contactActionHref("telefono", "0212 555 0134", "Hola")).toBe("tel:+582125550134");
    expect(contactActionHref("email", "duenio@ejemplo.com", "Hola")).toMatch(
      /^mailto:duenio@ejemplo\.com\?subject=/,
    );
  });

  /**
   * **El defecto que esto evita, y que ningún chequeo de tipos ve.** El
   * formulario acepta el número como lo escribe una persona — `0412 123 4567`,
   * `+58 412 1234567`, `04121234567` (publishable-listing.test.ts) — y `wa.me`
   * sólo entiende dígitos en formato internacional. Pasarle el valor guardado
   * tal cual abre WhatsApp con un número que no existe: no rompe nada, no
   * avisa nada, y la conversación que el producto existe para provocar no
   * ocurre.
   */
  it.each([
    ["0412 123 4567"],
    ["0412-1234567"],
    ["+58 412 1234567"],
    ["04121234567"],
    ["584121234567"],
    // Sin el 0 nacional y sin el país: diez dígitos, que el formulario acepta.
    ["412 123 4567"],
  ])("normaliza %s al formato internacional para wa.me", (stored) => {
    expect(contactActionHref("whatsapp", stored, "Hola")).toContain("wa.me/584121234567?");
  });

  /**
   * El mensaje redactado es lo último que hace el producto antes de que la
   * conversación se vaya a WhatsApp (tasks.md 16.31). Va codificado: sin eso,
   * un título con `&` corta el texto justo donde el aviso se nombra.
   */
  it("lleva el mensaje redactado, codificado", () => {
    const href = contactActionHref("whatsapp", "04121234567", "Hola, vi tu aviso «A & B»");

    expect(href).toContain(encodeURIComponent("Hola, vi tu aviso «A & B»"));
    expect(href).not.toContain(" ");
  });

  it("mantiene separados el destino y el texto", () => {
    // Un `text=` mal armado termina dentro del número, y WhatsApp abre un chat
    // con un contacto que no existe.
    expect(contactActionHref("whatsapp", "04121234567", "Hola")).toBe(
      "https://wa.me/584121234567?text=Hola",
    );
  });
});
