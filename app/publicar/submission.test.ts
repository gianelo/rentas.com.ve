import { describe, expect, it } from "vitest";
import { validatePublishableListing } from "../../src/modules/listing-publication/domain/publishable-listing";
import { readValues, STEP_TWO_VIOLATIONS, toDraft } from "./submission";

/**
 * The two decisions step 1's handler makes on its own. Everything else it
 * does — the session gate, the zone query, the redirect — belongs to layers
 * already proven elsewhere, and asserting them here would test Next.js.
 */

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("reading the submitted form", () => {
  it("keeps only the fields the form posts", () => {
    const values = readValues(form({ title: "Real", publisherId: "usr_otro", rooms: "2" }));

    // The same allowlist the draft cookie applies, at the other end of the
    // round trip: a publisher id must only ever come from the session.
    expect(values).toEqual({ title: "Real", rooms: "2" });
  });

  it("treats an untouched field as absent, not as an empty answer", () => {
    // A browser posts every control, including the ones nobody filled. Left
    // as "", the validator would report `priceUsd.invalid` — "that is not a
    // number" — when the truth is `priceUsd.required`.
    expect(readValues(form({ title: "Real", priceUsd: "" }))).toEqual({ title: "Real" });
  });
});

describe("turning strings into a draft", () => {
  it("parses the numeric fields and leaves the rest alone", () => {
    const draft = toDraft({ priceUsd: "450", rooms: "2", areaM2: "78", title: "Real" });

    expect(draft.priceUsd).toBe(450);
    expect(draft.rooms).toBe(2);
    expect(draft.areaM2).toBe(78);
    expect(draft.title).toBe("Real");
  });

  it("lets the domain judge a price that is not a number", () => {
    const draft = toDraft({ priceUsd: "quinientos" });

    // NaN rather than a thrown error or a silent zero: `priceUsd.invalid` is
    // the domain's answer, and the parsing decides nothing the domain decides.
    expect(Number.isNaN(draft.priceUsd)).toBe(true);
    expect(validatePublishableListing(draft, [])).toContain("priceUsd.invalid");
  });

  it("distinguishes a missing number from a wrong one", () => {
    expect(toDraft({}).priceUsd).toBeUndefined();
    expect(validatePublishableListing(toDraft({}), [])).toContain("priceUsd.required");
  });
});

describe("photo rules belong to step 2", () => {
  it("filters exactly the codes with no control on this screen", () => {
    // An error pointing at a field the publisher cannot see is a dead end.
    expect([...STEP_TWO_VIOLATIONS]).toEqual(["photos.required", "photos.tooMany"]);
  });

  it("reports nothing about photos for an otherwise valid draft", () => {
    const draft = toDraft({
      publisherType: "owner",
      title: "Apartamento 2 habitaciones en Chacao",
      description: "x".repeat(140),
      priceUsd: "450",
      cityId: "dc",
      zoneId: "chacao",
      rooms: "2",
      areaM2: "78",
      contactMethod: "whatsapp",
      contactValue: "04121234567",
    });

    const reported = validatePublishableListing(draft, [{ id: "chacao", cityId: "dc" }]).filter(
      (violation) => !STEP_TWO_VIOLATIONS.includes(violation),
    );

    expect(reported).toEqual([]);
  });

  it("still lets the full rule run later — nothing is skipped overall", () => {
    // The filter is a presentation decision. publishListing re-runs the whole
    // validator at publish time, so a listing with no photo is still refused
    // — just by the layer that can do something about it.
    const withoutPhotos = validatePublishableListing(
      { ...toDraft({ title: "Real" }), photoCount: 0 },
      [],
    );

    expect(withoutPhotos).toContain("photos.required");
  });
});
