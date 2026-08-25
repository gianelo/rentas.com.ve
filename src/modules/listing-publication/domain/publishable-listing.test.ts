import { describe, expect, it } from "vitest";
import {
  type ContactMethod,
  type DraftListing,
  MAX_DESCRIPTION_CHARACTERS,
  MAX_PHOTOS_PER_LISTING,
  MAX_TITLE_CHARACTERS,
  validatePublishableListing,
} from "./publishable-listing";

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
    propertyType: "apartamento",
    title: "Apartamento 2 habitaciones con puesto de estacionamiento",
    description: VALID_DESCRIPTION,
    priceUsd: 520,
    cityId: CAPITAL,
    zoneId: "zone-chacao",
    contactMethod: "whatsapp",
    contactValue: "04121234567",
    photoCount: 1,
    rooms: 2,
    areaM2: 78,
    bathrooms: 2,
    parkingSpots: 1,
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

  /**
   * Artboard 2b draws a four-cell stat strip -- `2 HAB | 2 BAÑOS | 78 M² |
   * 1 PUESTO` -- and two of the cells had no column behind them until now.
   *
   * The two fields are deliberately ASYMMETRIC, and that asymmetry is the
   * only thing worth testing here: for bathrooms an absent value is a gap,
   * for parking it is an answer.
   */
  describe("bathrooms and parking — the same strip, opposite rules", () => {
    it("refuses a draft with no bathroom count", () => {
      // A blank cell beside three numbers reads as broken rather than as
      // absent, so the strip has no empty state to fall back on.
      expect(validatePublishableListing(draft({ bathrooms: undefined }), ZONES)).toContain(
        "bathrooms.required",
      );
    });

    it.each([
      ["negative", -1],
      ["zero", 0],
      ["fractional", 1.5],
      ["not a number", Number.NaN],
    ])("rejects a %s bathroom count", (_label, bathrooms) => {
      // Zero is refused here and accepted for parking two tests below. That
      // is the whole distinction: a home has a bathroom, and a listing
      // claiming none is a typo rather than a property.
      expect(validatePublishableListing(draft({ bathrooms }), ZONES)).toContain(
        "bathrooms.invalid",
      );
    });

    it("accepts a listing with no parking, stated as zero", () => {
      // An anexo without a puesto is an ordinary listing, and zero is the
      // FACT that says so -- not a missing value dressed as one.
      expect(validatePublishableListing(draft({ parkingSpots: 0 }), ZONES)).toEqual([]);
    });

    it("does not require parking at all", () => {
      // No `parkingSpots.required` code exists. A publisher who never touched
      // the field has still produced a publishable listing, which is what
      // keeps the extra field from becoming extra friction on the one side of
      // this marketplace that is scarce.
      expect(validatePublishableListing(draft({ parkingSpots: undefined }), ZONES)).toEqual([]);
    });

    it.each([
      ["negative", -1],
      ["fractional", 1.5],
      ["infinite", Number.POSITIVE_INFINITY],
    ])("rejects a %s parking count", (_label, parkingSpots) => {
      expect(validatePublishableListing(draft({ parkingSpots }), ZONES)).toContain(
        "parkingSpots.invalid",
      );
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

    it("rejects more photos than a listing may hold", () => {
      // D12's storage arithmetic ("six per listing is roughly 30 MB") is what
      // the ~7,000-listing free-tier figure rests on, and until now nothing
      // applied the ceiling that arithmetic assumed.
      expect(
        validatePublishableListing(draft({ photoCount: MAX_PHOTOS_PER_LISTING + 1 }), ZONES),
      ).toContain("photos.tooMany");
      expect(
        validatePublishableListing(draft({ photoCount: MAX_PHOTOS_PER_LISTING }), ZONES),
      ).toEqual([]);
    });

    // broker-bulk-import spec, "Drafts Are Not Published Listings" +
    // "Whole-File Validation Before Any Write" (tasks.md 9.12/9.15): a
    // draft is created with zero photos by construction (they attach
    // afterwards, tasks.md 9.20-9.23), so `photos.required` cannot apply at
    // draft-creation time — only at activation.
    describe('stage "draft" — the photo requirement is deferred to activation', () => {
      it("does NOT reject a draft with zero photos", () => {
        expect(validatePublishableListing(draft({ photoCount: 0 }), ZONES, "draft")).not.toContain(
          "photos.required",
        );
      });

      it("still rejects more photos than a listing may hold, even in draft stage", () => {
        expect(
          validatePublishableListing(
            draft({ photoCount: MAX_PHOTOS_PER_LISTING + 1 }),
            ZONES,
            "draft",
          ),
        ).toContain("photos.tooMany");
      });

      it("every other rule still applies unchanged in draft stage", () => {
        expect(
          validatePublishableListing(draft({ photoCount: 0, title: "" }), ZONES, "draft"),
        ).toContain("title.required");
      });

      it("defaults to activation stage when no stage is given, unchanged behaviour", () => {
        expect(validatePublishableListing(draft({ photoCount: 0 }), ZONES)).toContain(
          "photos.required",
        );
      });
    });

    it("rejects an empty or whitespace-only title", () => {
      expect(validatePublishableListing(draft({ title: "" }), ZONES)).toContain("title.required");
      expect(validatePublishableListing(draft({ title: "   " }), ZONES)).toContain(
        "title.required",
      );
    });

    it("no publica un aviso sin tipo de propiedad, y lo dice con ese codigo", () => {
      // Criterio de aceptacion 1, y hasta ahora ningun test lo tocaba: la
      // verificacion por mutacion apago `propertyType.required` y la suite
      // entera siguio verde. El codigo importa tanto como la negativa —
      // `propertyType.invalid` manda a "elegi una de las cinco" a alguien que
      // no eligio ninguna, que es una instruccion para un problema distinto.
      expect(validatePublishableListing(draft({ propertyType: undefined }), ZONES)).toContain(
        "propertyType.required",
      );
    });

    it("no aplica ningun valor por defecto al tipo de propiedad", () => {
      // Un default convierte "al que se le olvido" en "todos son
      // apartamentos", y el tipo es lo que separa un anexo de $150 de un
      // apartamento de $150: sin el, el filtro de precio miente.
      const violations = validatePublishableListing(draft({ propertyType: undefined }), ZONES);

      expect(violations).not.toEqual([]);
      expect(violations).not.toContain("propertyType.invalid");
    });

    it("acepta los cinco de la lista cerrada y nada mas", () => {
      for (const type of ["apartamento", "casa", "quinta", "anexo", "habitacion"] as const) {
        expect(validatePublishableListing(draft({ propertyType: type }), ZONES)).toEqual([]);
      }

      expect(
        validatePublishableListing(
          draft({ propertyType: "local" as unknown as DraftListing["propertyType"] }),
          ZONES,
        ),
      ).toContain("propertyType.invalid");
    });

    it("rechaza un titulo de mas de 90 caracteres, que es lo que el contador cuenta", () => {
      // Seccion 3 de la especificacion de Publicar: "Maximo 90 caracteres".
      // El paso 6 dibuja "37 / 90" mientras se escribe, asi que sin esta
      // regla el contador anunciaria un tope que nada aplica -- y la tarjeta
      // de la lista recorta lo que sobra sin decirlo.
      expect(
        validatePublishableListing(draft({ title: "a".repeat(MAX_TITLE_CHARACTERS) }), ZONES),
      ).toEqual([]);
      expect(
        validatePublishableListing(draft({ title: "a".repeat(MAX_TITLE_CHARACTERS + 1) }), ZONES),
      ).toContain("title.tooLong");
    });

    it("cuenta el titulo en puntos de codigo, igual que la descripcion", () => {
      // 90 emoji son 90 caracteres para quien escribe y 180 unidades UTF-16
      // para `String.length`. Contarlos mal rechaza un titulo que el propio
      // contador de la pantalla dio por bueno.
      const noventaEmoji = "\u{1F3E0}".repeat(MAX_TITLE_CHARACTERS);

      expect(validatePublishableListing(draft({ title: noventaEmoji }), ZONES)).toEqual([]);
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

    it("rejects a description longer than a phone screen will ever be read on", () => {
      // `description` is `text` NOT NULL with no ceiling in Postgres, so
      // without this nothing stops megabytes of pasted text from landing in
      // a mandatory column — six times per listing, against a free tier.
      // The limit is a product one first: nobody reads 1,200+ characters of
      // rental copy on a phone, and the detail page has to render all of it.
      expect(
        validatePublishableListing(
          draft({ description: "a".repeat(MAX_DESCRIPTION_CHARACTERS + 1) }),
          ZONES,
        ),
      ).toContain("description.tooLong");
      expect(
        validatePublishableListing(
          draft({ description: "a".repeat(MAX_DESCRIPTION_CHARACTERS) }),
          ZONES,
        ),
      ).toEqual([]);
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

/**
 * The contact is what the whole product exists to deliver: a tenant finds a
 * listing and gets a way to reach whoever published it. **The design draws
 * this and never asks for it** — artboard 2b renders "Ver WhatsApp del dueño"
 * while no form in the system collects a contact.
 */
describe("contact — a method plus a value, not a phone number", () => {
  it("rejects a missing method", () => {
    expect(validatePublishableListing(draft({ contactMethod: undefined }), ZONES)).toContain(
      "contactMethod.required",
    );
  });

  it("rejects a method outside the three offered", () => {
    expect(
      validatePublishableListing(draft({ contactMethod: "telegram" as ContactMethod }), ZONES),
    ).toContain("contactMethod.invalid");
  });

  it("rejects a missing or blank value", () => {
    expect(validatePublishableListing(draft({ contactValue: undefined }), ZONES)).toContain(
      "contactValue.required",
    );
    expect(validatePublishableListing(draft({ contactValue: "   " }), ZONES)).toContain(
      "contactValue.required",
    );
  });

  it.each([
    ["0412 123 4567", "spaces, as people write them"],
    ["0412-1234567", "a dash"],
    ["+58 412 1234567", "the country code"],
    ["04121234567", "plain"],
  ])("accepts %s — %s", (contactValue) => {
    // Refusing any of these teaches publishers to distrust the form. They are
    // the same number written the way a person writes it.
    expect(validatePublishableListing(draft({ contactValue }), ZONES)).toEqual([]);
  });

  it.each([
    ["0412", "too short"],
    ["no-tengo", "not a number at all"],
  ])("rejects %s as a phone — %s", (contactValue) => {
    expect(validatePublishableListing(draft({ contactValue }), ZONES)).toContain(
      "contactValue.invalid",
    );
  });

  it("checks an email as an email, not as a phone", () => {
    // The method decides which shape applies. Without that, an address would
    // be judged by the phone rule and refused for having no digits.
    expect(
      validatePublishableListing(
        draft({ contactMethod: "email", contactValue: "ana@ejemplo.com" }),
        ZONES,
      ),
    ).toEqual([]);
    expect(
      validatePublishableListing(
        draft({ contactMethod: "email", contactValue: "ana-arroba-ejemplo" }),
        ZONES,
      ),
    ).toContain("contactValue.invalid");
  });

  it("does not pretend to verify anything", () => {
    // Shape only. Nothing here proves the line rings or the address exists —
    // only sending something does, and phone verification is a disabled port
    // (D9). An address nobody reads passes, and that is honest.
    expect(
      validatePublishableListing(
        draft({ contactMethod: "email", contactValue: "nadie@dominio-que-no-existe.com" }),
        ZONES,
      ),
    ).toEqual([]);
  });
});
