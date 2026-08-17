import { describe, expect, it } from "vitest";
import { type DraftListing, validatePublishableListing } from "./publishable-listing";

/**
 * Every rule asserted here is quoted from a spec or the design system, not
 * invented at the keyboard:
 *
 * - listing-publication/spec.md "Minimum Publishable Content": title,
 *   description, price, city, zone, publisher_type, and at least one photo.
 * - "Mandatory, Non-Inferred Publisher Type": missing type is rejected, and
 *   no default is applied.
 * - "USD-Only Price": non-numeric or negative is rejected; exactly one USD
 *   amount is stored.
 * - "Curated Zone Selection": zone comes from the city's curated list; a
 *   zone valid only for the other city is rejected (this is D5 again, at the
 *   application boundary rather than the database one).
 * - SISTEMA.md screen 3: "Descripción: mínimo 120 caracteres, con contador."
 *
 * The function returns every violation rather than throwing on the first.
 * The publish form shows per-field errors (SISTEMA.md screen 3), and a
 * fail-fast validator cannot fill that screen: a publisher who left three
 * fields empty would fix one, resubmit, and be told about the next.
 */

const CAPITAL = "city-distrito-capital";
const MARACAIBO = "city-maracaibo";

const ZONES = [
  { id: "zone-chacao", cityId: CAPITAL },
  { id: "zone-la-lago", cityId: MARACAIBO },
] as const;

const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

function draft(overrides: Partial<DraftListing> = {}): DraftListing {
  return {
    publisherType: "owner",
    title: "Apartamento 2 habitaciones con puesto de estacionamiento",
    description: VALID_DESCRIPTION,
    priceUsd: 520,
    cityId: CAPITAL,
    zoneId: "zone-chacao",
    photoCount: 1,
    rooms: 2,
    areaM2: 78,
    ...overrides,
  };
}

describe("validatePublishableListing", () => {
  it("accepts a draft that satisfies every published rule", () => {
    expect(validatePublishableListing(draft(), ZONES)).toEqual([]);
  });

  describe("publisher type — mandatory and never inferred", () => {
    it("rejects a missing publisher type", () => {
      expect(validatePublishableListing(draft({ publisherType: undefined }), ZONES)).toContain(
        "publisherType.required",
      );
    });

    it("rejects a publisher type outside owner | broker", () => {
      expect(
        validatePublishableListing(
          draft({ publisherType: "agency" as DraftListing["publisherType"] }),
          ZONES,
        ),
      ).toContain("publisherType.invalid");
    });

    it("applies no default — a missing type never silently becomes owner", () => {
      // The whole point of the rule. If this ever regresses, every listing
      // whose type was not resolved is published as an owner, and the trust
      // distinction the product rests on becomes decoration.
      const errors = validatePublishableListing(draft({ publisherType: undefined }), ZONES);

      expect(errors).not.toEqual([]);
      expect(errors).toContain("publisherType.required");
    });
  });

  describe("price — USD only", () => {
    it.each([
      ["negative", -1],
      ["zero", 0],
      ["not a number", Number.NaN],
      ["infinite", Number.POSITIVE_INFINITY],
      ["fractional", 450.5],
    ])("rejects a %s price", (_label, priceUsd) => {
      expect(validatePublishableListing(draft({ priceUsd }), ZONES)).toContain("priceUsd.invalid");
    });

    it("rejects a missing price", () => {
      expect(validatePublishableListing(draft({ priceUsd: undefined }), ZONES)).toContain(
        "priceUsd.required",
      );
    });
  });

  /**
   * `rooms` and `area_m2` are NOT NULL in the schema and were declared on
   * `DraftListing` from the start — but nothing here checked them, so a draft
   * missing either passed validation and died at the INSERT instead. That is
   * a 500 where the publisher deserved a field error, and it is the same
   * shape of defect this project has shipped repeatedly: a rule that exists
   * in one layer and is merely *declared* in the other.
   */
  describe("rooms and area — required because the column is", () => {
    it.each([
      ["rooms", "rooms.required" as const],
      ["areaM2", "areaM2.required" as const],
    ])("rejects a missing %s", (field, code) => {
      expect(validatePublishableListing(draft({ [field]: undefined }), ZONES)).toContain(code);
    });

    it.each([
      ["negative", -1],
      ["zero", 0],
      ["fractional", 2.5],
      ["not a number", Number.NaN],
    ])("rejects a %s room count", (_label, rooms) => {
      expect(validatePublishableListing(draft({ rooms }), ZONES)).toContain("rooms.invalid");
    });

    it.each([
      ["negative", -1],
      ["zero", 0],
      ["fractional", 78.4],
      ["infinite", Number.POSITIVE_INFINITY],
    ])("rejects a %s area", (_label, areaM2) => {
      expect(validatePublishableListing(draft({ areaM2 }), ZONES)).toContain("areaM2.invalid");
    });

    it("accepts a studio declared as one room", () => {
      // Zero would be the intuitive encoding for a studio and it is refused
      // on purpose: `area_m2` already carries the size, and a zero here reads
      // as "unknown" everywhere it is rendered.
      expect(validatePublishableListing(draft({ rooms: 1 }), ZONES)).toEqual([]);
    });
  });

  describe("minimum publishable content", () => {
    it("rejects a listing with no photo", () => {
      // spec.md scenario: "a publisher who has filled all fields except a
      // photo... the system rejects the submission until at least one photo
      // is attached."
      expect(validatePublishableListing(draft({ photoCount: 0 }), ZONES)).toContain(
        "photos.required",
      );
    });

    it("rejects an empty or whitespace-only title", () => {
      expect(validatePublishableListing(draft({ title: "" }), ZONES)).toContain("title.required");
      expect(validatePublishableListing(draft({ title: "   " }), ZONES)).toContain(
        "title.required",
      );
    });

    it("rejects a description shorter than the 120 characters the form promises", () => {
      // SISTEMA.md screen 3 ships a live counter against this number. If the
      // validator disagreed with the counter, the form would either block a
      // publisher the counter said was fine, or accept one it said was not.
      expect(validatePublishableListing(draft({ description: "a".repeat(119) }), ZONES)).toContain(
        "description.tooShort",
      );
      expect(validatePublishableListing(draft({ description: "a".repeat(120) }), ZONES)).toEqual(
        [],
      );
    });

    it("counts characters, not bytes, so accented Spanish is not penalised", () => {
      // "Descripción" and "eléctrica" are ordinary words here. A byte-length
      // check would quietly demand a longer text from anyone writing normal
      // Spanish than from someone writing ASCII.
      const accented = "á".repeat(120);

      expect(validatePublishableListing(draft({ description: accented }), ZONES)).toEqual([]);
    });
  });

  describe("city and zone — curated, and D5 at the application boundary", () => {
    it("rejects a missing city", () => {
      expect(validatePublishableListing(draft({ cityId: undefined }), ZONES)).toContain(
        "cityId.required",
      );
    });

    it("rejects a city outside the launch set", () => {
      expect(validatePublishableListing(draft({ cityId: "city-valencia" }), ZONES)).toContain(
        "cityId.unknown",
      );
    });

    it("rejects a zone that belongs to the other city", () => {
      // spec.md: "they submit a zone value that is not in Maracaibo's
      // curated zone list (including a zone valid only for Distrito
      // Capital)". The database refuses this too (D5's composite key) — but
      // a constraint violation is a 500, and this is a form error.
      expect(
        validatePublishableListing(draft({ cityId: MARACAIBO, zoneId: "zone-chacao" }), ZONES),
      ).toContain("zoneId.notInCity");
    });

    it("rejects a zone that does not exist in the curated list at all", () => {
      expect(validatePublishableListing(draft({ zoneId: "zone-free-text" }), ZONES)).toContain(
        "zoneId.notInCity",
      );
    });
  });

  it("reports every violation at once, not just the first", () => {
    const errors = validatePublishableListing(
      draft({ publisherType: undefined, title: "", priceUsd: -5, photoCount: 0 }),
      ZONES,
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        "publisherType.required",
        "title.required",
        "priceUsd.invalid",
        "photos.required",
      ]),
    );
  });
});
