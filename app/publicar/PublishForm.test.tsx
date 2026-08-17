import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MIN_DESCRIPTION_CHARACTERS } from "../../src/modules/listing-publication/domain/publishable-listing";
import { PublishForm } from "./PublishForm";

/**
 * SISTEMA.md screen 3 — "la única pantalla compleja del lado de la oferta.
 * El dueño la llena de pie, con una mano."
 *
 * These assertions are about what the form PROMISES, not how it looks. Two
 * of them are load-bearing beyond this screen:
 *
 * - **No publisher type is pre-selected.** The domain refuses a missing type
 *   and applies no default, precisely so nobody is published as an owner
 *   they never claimed to be. A checked radio here would reinstate that
 *   default in the one layer the domain cannot see.
 * - **Required is marked with the glyph AND the word.** The design says
 *   "nunca solo con color", and this form is filled one-handed on a phone in
 *   daylight, sometimes in forced-colors mode.
 */

const cities = [
  { id: "dc", name: "Distrito Capital" },
  { id: "mcbo", name: "Maracaibo" },
];

const zones = [
  { id: "chacao", name: "Chacao", cityId: "dc" },
  { id: "altamira", name: "Altamira", cityId: "dc" },
  { id: "la-lago", name: "La Lago", cityId: "mcbo" },
];

function render(props: Partial<Parameters<typeof PublishForm>[0]> = {}) {
  return renderToStaticMarkup(<PublishForm cities={cities} zones={zones} {...props} />);
}

describe("PublishForm", () => {
  it("offers exactly the two publisher types, with neither pre-selected", () => {
    const markup = render();

    expect(markup.match(/name="publisherType"/g) ?? []).toHaveLength(2);
    expect(markup).toContain('value="owner"');
    expect(markup).toContain('value="broker"');
    // The whole trust guarantee (SISTEMA.md "Distinción dueño / inmobiliaria")
    // in one assertion: a `checked` attribute here publishes every hurried
    // publisher as whichever option happened to be first.
    expect(markup).not.toContain("checked");
  });

  it("says the publisher type cannot be changed later, as the design requires", () => {
    expect(render()).toMatch(/no se puede cambiar/i);
  });

  it("marks every required field with the glyph and the word, never colour alone", () => {
    const markup = render();
    const markers = markup.match(/✱ obligatorio/g) ?? [];

    // publisherType, title, priceUsd, cityId, zoneId, rooms, areaM2,
    // description — eight required fields, eight markers.
    expect(markers).toHaveLength(8);
  });

  it("asks for rooms and area, which the schema requires and the design's field list omits", () => {
    const markup = render();

    expect(markup).toContain('name="rooms"');
    expect(markup).toContain('name="areaM2"');
    expect(markup).toMatch(/habitaciones/i);
    expect(markup).toMatch(/metros/i);
  });

  it("orders the fields the way the design lists them", () => {
    const markup = render();
    const order = ["publisherType", "title", "priceUsd", "cityId", "zoneId", "rooms", "areaM2"];
    const positions = order.map((name) => markup.indexOf(`name="${name}"`));

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // Description last, after the two added fields.
    expect(markup.indexOf('name="description"')).toBeGreaterThan(markup.indexOf('name="areaM2"'));
  });

  it("offers only the selected city's zones", () => {
    const markup = render({ values: { cityId: "dc" } });

    expect(markup).toContain("Chacao");
    expect(markup).toContain("Altamira");
    expect(markup).not.toContain("La Lago");
  });

  it("states the description minimum before anyone has failed it", () => {
    // The design pairs a neutral help text with the error, not instead of
    // it. Being told the rule only after breaking it is a worse form.
    expect(render()).toContain(String(MIN_DESCRIPTION_CHARACTERS));
  });

  it("closes with the promise the design makes", () => {
    expect(render()).toContain("Tu aviso queda activo 30 días.");
  });

  it("puts each violation's message under its own field, and marks it invalid", () => {
    const markup = render({
      values: { description: "muy corta" },
      violations: ["description.tooShort", "priceUsd.invalid"],
    });

    expect(markup).toContain("✱ Mínimo 120 caracteres. Vas 9.");
    expect(markup).toContain("Solo el número, en dólares y sin centavos. Por ejemplo: 520.");
    // Announced, not merely coloured: a border says nothing to a screen
    // reader, and `aria-describedby` is what reads the message aloud.
    expect(markup.match(/aria-invalid="true"/g) ?? []).toHaveLength(2);
    expect(markup).toContain('aria-describedby="description-error"');
  });

  it("keeps what was already typed when it re-renders with errors", () => {
    const markup = render({
      values: { title: "Apartamento en Chacao", priceUsd: "520", rooms: "2" },
      violations: ["description.required"],
    });

    // Losing a description someone typed one-handed on a phone, because one
    // other field was wrong, is how a form stops being filled in at all.
    expect(markup).toContain('value="Apartamento en Chacao"');
    expect(markup).toContain('value="520"');
    expect(markup).toContain('value="2"');
  });

  it("ships no client-side behaviour", () => {
    const markup = render({ violations: ["title.required"] });

    // SISTEMA.md: JS is allowed in step 2 (photos), nowhere else on this
    // screen. A native POST is what makes the form work on a bad connection
    // before any bundle has arrived.
    expect(markup).toContain('method="post"');
    expect(markup).not.toMatch(/onchange|onclick|oninput/i);
  });
});
