import { describe, expect, it } from "vitest";
import {
  MAX_DESCRIPTION_CHARACTERS,
  MAX_TITLE_CHARACTERS,
  MIN_DESCRIPTION_CHARACTERS,
  type PublishViolation,
  validatePublishableListing,
} from "../../src/modules/listing-publication/domain/publishable-listing";
import {
  listingEditViolationMessage,
  PUBLISH_VIOLATION_COPY,
  PUBLISHER_TYPE_IMMUTABLE_NOTICE,
  publishViolationMessage,
} from "./violation-copy";

/**
 * The Spanish the publisher actually reads, mapped from the domain's stable
 * violation codes.
 *
 * This file exists because the two halves drift apart silently otherwise. The
 * domain returns codes on purpose — a validator that returned prose would
 * hard-code Spanish into the layer the broker importer also calls. The cost
 * of that decision is exactly one risk: a code with no copy. So the map is a
 * `Record` over the union, which makes that a compile error, and the specs
 * below make it a test failure too, because a `Record` alone would still let
 * someone satisfy the type with an empty string.
 */

/** Every code the validator can actually emit, gathered from real drafts. */
const EVERY_VIOLATION: readonly PublishViolation[] = [
  ...validatePublishableListing({}, []),
  ...validatePublishableListing(
    {
      publisherType: "agency" as never,
      propertyType: "local comercial" as never,
      title: "Un título",
      description: "x".repeat(MIN_DESCRIPTION_CHARACTERS - 1),
      priceUsd: -1,
      cityId: "city-unknown",
      zoneId: "zone-unknown",
      rooms: 0,
      areaM2: 0,
      // `bathrooms` omitted, not zeroed, so this one draft raises BOTH
      // `bathrooms.required` and -- through the next fixture -- `.invalid`.
      parkingSpots: -1,
      photoCount: 99,
    },
    [{ id: "zone-chacao", cityId: "city-capital" }],
  ),
  // A third draft only for the ceiling: it is the one rule the two above
  // cannot reach, because a description cannot be both too short and too
  // long. Adding a violation code therefore costs a fixture here as well as
  // an entry in the map — which is the point. A code nothing can produce is
  // copy nobody will ever read.
  ...validatePublishableListing({ description: "x".repeat(MAX_DESCRIPTION_CHARACTERS + 1) }, []),
  // Same reasoning, for `bathrooms`: a draft cannot omit the field and hold
  // an invalid value at once, so reaching `bathrooms.invalid` costs its own
  // fixture. That cost is the guard working -- it is what stops copy being
  // written for a code nothing can raise.
  ...validatePublishableListing({ bathrooms: 0 }, []),
  // A fourth and fifth draft for the contact's invalid shapes: a method
  // outside the three offered, and a value the chosen method refuses. The
  // drafts above reach both `required` codes but neither `invalid` one.
  ...validatePublishableListing(
    { contactMethod: "telegram" as never, contactValue: "no-es-un-numero" },
    [],
  ),
  ...validatePublishableListing({ contactMethod: "email", contactValue: "sin-arroba" }, []),
  // Y un septimo para el tope de 90 del titulo, por el mismo motivo que el de
  // la descripcion: un titulo no puede estar vacio y pasarse a la vez.
  ...validatePublishableListing({ title: "t".repeat(MAX_TITLE_CHARACTERS + 1) }, []),
];

describe("publish violation copy", () => {
  it("has copy for every reachable violation, and no copy for anything else", () => {
    // Set equality in BOTH directions, from codes the validator actually
    // produced rather than a hand-written list — a hand-written list is a
    // second copy of the union that goes stale the moment the domain grows,
    // which is the exact failure this file exists to prevent.
    //
    // The reverse direction matters just as much: an entry with no reachable
    // code is copy nobody will ever read, and it would survive a rename of
    // the code it was written for while the real one silently lost its
    // message.
    const reachable = [...new Set(EVERY_VIOLATION)].sort();
    const written = Object.keys(PUBLISH_VIOLATION_COPY).sort();

    expect(written).toEqual(reachable);
    // 25, up from 22 when `bathrooms` and `parkingSpots` arrived. The number
    // is asserted rather than derived: `written` and `reachable` are both
    // computed from the code, so a rule DELETED from the domain would empty
    // one and match the other. This line is what notices a rule going
    // missing, which is why it is worth updating by hand.
    // 27, up from 25 cuando llegaron `propertyType` y sus dos codigos. El
    // numero se afirma a mano y no se deriva: `written` y `reachable` salen
    // los dos del codigo, asi que una regla BORRADA del dominio vaciaria una
    // y haria coincidir la otra. Esta linea es la que nota que falta una.
    // 28, up from 27 cuando el paso 6 trajo el tope de 90 del titulo.
    expect(reachable).toHaveLength(28);
  });

  it("gives every code a real sentence, not a placeholder", () => {
    for (const [code, entry] of Object.entries(PUBLISH_VIOLATION_COPY)) {
      const message = entry.message({ descriptionLength: 0 });
      expect(message.length, code).toBeGreaterThan(10);
      // The design marks a required field with the glyph AND the word, never
      // colour alone — a message that opened with a bare glyph and stopped
      // would satisfy a length check while telling a publisher nothing.
      expect(message, code).toMatch(/[a-záéíóúñ]{4,}/i);
    }
  });

  it("names the field each code belongs to, so the message lands under it", () => {
    expect(PUBLISH_VIOLATION_COPY["description.tooShort"].field).toBe("description");
    expect(PUBLISH_VIOLATION_COPY["zoneId.notInCity"].field).toBe("zoneId");
    expect(PUBLISH_VIOLATION_COPY["photos.tooMany"].field).toBe("photos");
  });

  it("counts the description the publisher has written, as the design specifies", () => {
    // SISTEMA.md screen 3, verbatim: "✱ Mínimo 120 caracteres. Vas 24."
    expect(publishViolationMessage("description.tooShort", { descriptionLength: 24 })).toBe(
      "✱ Mínimo 120 caracteres. Vas 24.",
    );
  });

  it("counts characters the way the validator does", () => {
    // The validator counts code points, not UTF-16 units. A counter using
    // `.length` would tell someone writing emoji they had written more than
    // the rule credits them for, and the form would reject a description its
    // own counter called long enough.
    const withAstral = "🏠".repeat(10);

    expect(publishViolationMessage("description.tooShort", { description: withAstral })).toContain(
      "Vas 10.",
    );
  });

  it("marks required fields with the glyph and the word, never colour alone", () => {
    // The design is explicit: "Obligatorio se marca con el glifo ✱ más la
    // palabra 'obligatorio', nunca solo con color." Colour-blind publishers
    // and forced-colors mode both depend on this.
    const required = publishViolationMessage("title.required", {});

    expect(required).toContain("✱");
    expect(required.toLowerCase()).toContain("obligatorio");
  });

  it("explains the owner/broker rule rather than restating the field name", () => {
    const message = publishViolationMessage("publisherType.required", {});

    expect(message.toLowerCase()).toMatch(/dueño|inmobiliaria/);
  });
});

/**
 * tasks.md 18.20 — **la copia de editar es la misma copia, con una frase
 * más.**
 *
 * `ListingEditViolation` es `PublishViolation` más `publisherType.immutable`.
 * Una segunda tabla de español al lado de ésta sería la que después nadie
 * mantiene: los veinticinco códigos compartidos se delegan, y el único propio
 * dice lo que el paso 9 de publicar ya prometió.
 */
describe("listingEditViolationMessage — un solo español para publicar y editar (18.20)", () => {
  it("delega en la tabla de publicar para un código compartido, palabra por palabra", () => {
    expect(listingEditViolationMessage("priceUsd.invalid", {})).toBe(
      publishViolationMessage("priceUsd.invalid", {}),
    );
  });

  /**
   * El contador es la parte de la copia de publicar que más fácil se pierde al
   * copiarla: si esta delegación se rompiera devolviendo una frase propia, el
   * número desaparecería sin que nada más cambiara.
   */
  it("delegar conserva el contador, no sólo la frase", () => {
    expect(listingEditViolationMessage("description.tooShort", { description: "corta" })).toContain(
      "Vas 5",
    );
  });

  /**
   * **La misma promesa, no una parecida.** El paso 9 dice «Aparece siempre en
   * tu aviso y no se puede cambiar después» ANTES de publicar; la negativa al
   * editar tiene que decir eso mismo, o el producto habla con dos voces sobre
   * una sola regla.
   */
  it("el código propio de editar dice la promesa del paso 9, entera", () => {
    const message = listingEditViolationMessage("publisherType.immutable", {});

    expect(message).toContain(PUBLISHER_TYPE_IMMUTABLE_NOTICE);
    expect(PUBLISHER_TYPE_IMMUTABLE_NOTICE).toBe(
      "Aparece siempre en tu aviso y no se puede cambiar después.",
    );
  });

  /**
   * **Los códigos llegan por la URL**, porque sin JavaScript no hay otro lugar
   * donde devolverle la negativa a la pantalla. Una dirección escrita a mano
   * es dato de afuera: `PUBLISH_VIOLATION_COPY[inventado].message(...)` sería
   * `undefined.message`, o sea un 500 donde correspondía una frase. Vuelve el
   * código, que es el mismo `?? reason` que `importRowReasonText` ya usa.
   */
  it("un código que nadie definió vuelve como código y no tumba la pantalla", () => {
    expect(listingEditViolationMessage("precio.regalado", {})).toBe("precio.regalado");
  });

  it("no hay entrada de `publisherType.immutable` en la tabla de publicar", () => {
    // Los nueve pasos no pueden mostrarlo: `STEP_FOR_VIOLATION` es un `Record`
    // sobre la unión de publicar, y meterlo ahí obligaría a inventarle un paso.
    expect(Object.keys(PUBLISH_VIOLATION_COPY)).not.toContain("publisherType.immutable");
  });
});
