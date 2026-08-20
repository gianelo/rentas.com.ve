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

  it("marks the artboard's three fields, plus the contact pair it never drew", () => {
    const markup = render();
    const markers = markup.match(/✱ obligatorio/g) ?? [];

    // Artboard 2c marks three: the publisher type, the title and the price.
    // It leaves the selects and the description unmarked, and a marker on
    // every field is a marker that stops meaning anything.
    //
    // The contact pair is an ADDITION to the design — 2b renders "Ver
    // WhatsApp del dueño" while no artboard collects a value — so whether it
    // carries the marker is a decision, not a transcription. It does: a
    // listing whose contact cannot be revealed is a dead end wearing a
    // button, which makes it as unmissable as the price.
    expect(markers).toHaveLength(5);
  });

  it("pairs city with zone, and rooms with area, on one row", () => {
    const markup = render();

    // The 360 artboard puts them side by side exactly as 1280 does, so this
    // is structure rather than a breakpoint. Geometry is measured for real in
    // tests/measure/layout.spec.ts; this only asserts the pairing exists.
    const rows = markup.match(/class="[^"]*row[^"]*"/g) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("asks for rooms and area, which the schema requires and the design's field list omits", () => {
    const markup = render();

    expect(markup).toContain('name="rooms"');
    expect(markup).toContain('name="areaM2"');
    expect(markup).toMatch(/habitaciones/i);
    expect(markup).toMatch(/metros/i);
  });

  it("asks for bathrooms and parking, which artboard 2b renders and no artboard collects", () => {
    const markup = render();

    expect(markup).toContain('name="bathrooms"');
    expect(markup).toContain('name="parkingSpots"');
    // The parking help text carries the whole rule: a publisher must never
    // have to type a zero to say their anexo has no puesto. If this sentence
    // disappears the field silently becomes friction on the scarce side of
    // the marketplace, and nothing else in the suite would notice.
    expect(markup).toMatch(/si no tiene, dejalo vac/i);
  });

  it("orders the fields the way the design lists them", () => {
    const markup = render();
    const order = [
      "publisherType",
      "title",
      "priceUsd",
      "cityId",
      "zoneId",
      "rooms",
      "areaM2",
      "bathrooms",
      "parkingSpots",
      "contactMethod",
      "contactValue",
    ];
    const positions = order.map((name) => markup.indexOf(`name="${name}"`));

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // Description last, after the two added fields.
    expect(markup.indexOf('name="description"')).toBeGreaterThan(markup.indexOf('name="areaM2"'));
  });

  it("offers every zone, grouped by its city", () => {
    const markup = render({ values: { cityId: "dc" } });

    // This spec replaces one that asserted the opposite — that only the
    // selected city's zones appear — and that spec **locked the bug in**.
    // The city `<select>` sits inside a POST form with nothing to reload the
    // page, so `cityId` only ever arrived as a query parameter, which meant
    // it never arrived: the zone list was empty for every city and the form
    // could not be submitted at all. The test passed the whole time, because
    // it handed `cityId` in as a prop rather than walking the path a person
    // walks.
    expect(markup).toContain('<optgroup label="Distrito Capital">');
    expect(markup).toContain('<optgroup label="Maracaibo">');
    expect(markup).toContain("Chacao");
    expect(markup).toContain("La Lago");
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
