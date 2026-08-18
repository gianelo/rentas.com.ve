import { describe, expect, it } from "vitest";
import {
  MAX_DESCRIPTION_CHARACTERS,
  MIN_DESCRIPTION_CHARACTERS,
  type PublishViolation,
  validatePublishableListing,
} from "../../src/modules/listing-publication/domain/publishable-listing";
import { PUBLISH_VIOLATION_COPY, publishViolationMessage } from "./violation-copy";

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
      title: "Un título",
      description: "x".repeat(MIN_DESCRIPTION_CHARACTERS - 1),
      priceUsd: -1,
      cityId: "city-unknown",
      zoneId: "zone-unknown",
      rooms: 0,
      areaM2: 0,
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
    expect(reachable).toHaveLength(18);
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
