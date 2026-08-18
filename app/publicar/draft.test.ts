import { describe, expect, it } from "vitest";
import { MAX_DESCRIPTION_CHARACTERS } from "../../src/modules/listing-publication/domain/publishable-listing";
import { type PublishDraft, parseDraft, serialiseDraft } from "./draft";

/**
 * The draft that travels between step 1 and step 2.
 *
 * The assertion that matters most is the last one: the parsed object is
 * spread into the form's values, so anything this function is willing to
 * carry is something a cookie can inject into the form. An allowlist is what
 * keeps `publisherId` — the one field that must only ever come from the
 * session — unreachable rather than merely unlikely.
 */

const encode = (json: string) => Buffer.from(json, "utf8").toString("base64url");

const draft: PublishDraft = {
  values: {
    publisherType: "owner",
    title: "Apartamento 2 habitaciones en Chacao",
    priceUsd: "450",
    cityId: "dc",
    zoneId: "chacao",
    rooms: "2",
    areaM2: "78",
    description: "x".repeat(140),
  },
  violations: ["description.tooShort"],
};

describe("publish draft", () => {
  it("survives the round trip unchanged", () => {
    expect(parseDraft(serialiseDraft(draft))).toEqual(draft);
  });

  it.each([
    ["nothing at all", undefined],
    ["an empty string", ""],
    ["text that decodes to nothing useful", "no-soy-json"],
    ["a payload that is not an object", Buffer.from("42").toString("base64url")],
    ["a payload with no values", Buffer.from('{"violations":[]}').toString("base64url")],
  ])("returns null for %s rather than throwing", (_case, raw) => {
    // A truncated or hand-edited cookie gives the publisher an empty form,
    // which is recoverable. A thrown error gives them a 500, which is not.
    expect(parseDraft(raw)).toBeNull();
  });

  it("drops any field the form does not post", () => {
    const injected = Buffer.from(
      JSON.stringify({
        values: { title: "Real", publisherId: "usr_someone_else", status: "active" },
        violations: [],
      }),
    ).toString("base64url");

    const parsed = parseDraft(injected);

    // The parsed values are spread into the form. A carried `publisherId`
    // would arrive at exactly the place a publisher id must never come from
    // — the session is the only source, and that is what makes the ownership
    // check inside processUploadedPhoto mean anything.
    expect(parsed?.values).toEqual({ title: "Real" });
    expect(parsed?.values).not.toHaveProperty("publisherId");
  });

  it("ignores non-string values instead of carrying them", () => {
    const parsed = parseDraft(encode('{"values":{"title":"Real","priceUsd":450},"violations":[]}'));

    expect(parsed?.values).toEqual({ title: "Real" });
  });

  it("tolerates a missing or malformed violation list", () => {
    expect(parseDraft(encode('{"values":{"title":"x"}}'))?.violations).toEqual([]);
    expect(parseDraft(encode('{"values":{"title":"x"},"violations":"nope"}'))?.violations).toEqual(
      [],
    );
    expect(
      parseDraft(encode('{"values":{"title":"x"},"violations":[1,"title.required"]}'))?.violations,
    ).toEqual(["title.required"]);
  });

  it("fits a maximal draft inside one cookie", () => {
    // #38's description ceiling is what makes this true. Without it the
    // failure would arrive in production at an arbitrary, unreproducible
    // size — the request simply loses its cookie and the form empties.
    const maximal: PublishDraft = {
      values: {
        ...draft.values,
        title: "T".repeat(200),
        description: "á".repeat(MAX_DESCRIPTION_CHARACTERS),
      },
      violations: ["description.tooLong", "photos.required"],
    };

    const bytes = Buffer.byteLength(encodeURIComponent(serialiseDraft(maximal)), "utf8");

    // Accented Spanish is the realistic worst case: every character is two
    // bytes in UTF-8 and three more once percent-encoded.
    expect(bytes).toBeLessThan(4096);
  });
});
