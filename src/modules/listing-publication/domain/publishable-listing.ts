/**
 * Minimum publishable content, as the listing-publication spec defines it,
 * expressed as a pure function over a draft.
 *
 * Pure and dependency-free on purpose (design.md, module layering): this is
 * the layer carrying the 90% coverage floor, and it is the only place the
 * publish rules exist. The spec's "Uniform Validation Across Every Entry
 * Path" requirement is what makes that mandatory rather than tidy — the
 * broker bulk import (Phase 9) must be held to exactly these rules, and it
 * will call exactly this function. A rule implemented in a form handler is
 * a rule the importer does not have.
 */

export type PublisherType = "owner" | "broker";

export interface DraftListing {
  readonly publisherType?: PublisherType;
  readonly title?: string;
  readonly description?: string;
  readonly priceUsd?: number;
  readonly cityId?: string;
  readonly zoneId?: string;
  readonly photoCount?: number;
  readonly rooms?: number;
  readonly areaM2?: number;
}

/** A curated zone, scoped to its city. Free-text zones do not exist (D5). */
export interface CuratedZone {
  readonly id: string;
  readonly cityId: string;
}

/**
 * Stable, translatable codes rather than sentences. The publish form renders
 * Spanish copy next to the field that failed (SISTEMA.md screen 3), and a
 * validator that returned prose would either hard-code that copy in the
 * domain layer or force the form to match on strings.
 */
export type PublishViolation =
  | "publisherType.required"
  | "publisherType.invalid"
  | "title.required"
  | "description.required"
  | "description.tooShort"
  | "priceUsd.required"
  | "priceUsd.invalid"
  | "cityId.required"
  | "cityId.unknown"
  | "zoneId.required"
  | "zoneId.notInCity"
  | "rooms.required"
  | "rooms.invalid"
  | "areaM2.required"
  | "areaM2.invalid"
  | "photos.required"
  | "photos.tooMany";

/**
 * SISTEMA.md screen 3 ships a live counter against this exact number. The
 * constant is exported so the form can render the counter from the same
 * source the validator enforces — two copies of "120" is how a counter comes
 * to disagree with the rule it is counting toward.
 */
export const MIN_DESCRIPTION_CHARACTERS = 120;

/**
 * Six. **The number is design.md's, but the enforcement is new here**: D12's
 * storage arithmetic ("six per listing is roughly 30 MB") assumes a ceiling
 * that nothing was actually applying, so the ~7,000-listing figure the free
 * tier is planned around rested on publishers being moderate.
 *
 * It is also the cheapest DoS bound this flow has. Each photo costs a network
 * read plus a `sharp` decode inside a serverless function with a fixed memory
 * ceiling, so an unbounded array is a request that decides how much compute
 * it gets to spend.
 */
export const MAX_PHOTOS_PER_LISTING = 6;

const PUBLISHER_TYPES: readonly string[] = ["owner", "broker"];

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/**
 * Character count, not `String.length`, which counts UTF-16 code units. For
 * ordinary Spanish the two agree — but the moment a description carries an
 * emoji or any astral-plane character, `.length` counts it twice and the
 * counter on screen would disagree with the rule.
 */
function characterCount(value: string): number {
  return [...value].length;
}

function isWholePositiveNumber(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Returns EVERY violation, never throwing and never stopping at the first.
 * The form shows per-field errors, and a fail-fast validator cannot fill
 * that screen: a publisher who left three fields empty would fix one,
 * resubmit, and only then be told about the next.
 */
export function validatePublishableListing(
  draft: DraftListing,
  curatedZones: readonly CuratedZone[],
): PublishViolation[] {
  const violations: PublishViolation[] = [];

  // No default is applied here, and none may be added later. A default
  // turns "the caller forgot" into "everyone is an owner", and the
  // owner/broker distinction is a trust guarantee (SISTEMA.md), not a
  // display preference.
  if (draft.publisherType === undefined) {
    violations.push("publisherType.required");
  } else if (!PUBLISHER_TYPES.includes(draft.publisherType)) {
    violations.push("publisherType.invalid");
  }

  if (isBlank(draft.title)) {
    violations.push("title.required");
  }

  if (isBlank(draft.description)) {
    violations.push("description.required");
  } else if (characterCount(draft.description as string) < MIN_DESCRIPTION_CHARACTERS) {
    violations.push("description.tooShort");
  }

  // "USD-Only Price": one numeric field, no currency selector, no
  // conversion. Whole dollars — the design shows prices as `$520`, never
  // with cents, and accepting fractions would render a value the row layout
  // has no room for.
  if (draft.priceUsd === undefined) {
    violations.push("priceUsd.required");
  } else if (!isWholePositiveNumber(draft.priceUsd)) {
    violations.push("priceUsd.invalid");
  }

  if (draft.cityId === undefined || draft.cityId.trim() === "") {
    violations.push("cityId.required");
  } else if (!curatedZones.some((zone) => zone.cityId === draft.cityId)) {
    // A city with no curated zone is not a city this product launches in.
    violations.push("cityId.unknown");
  }

  if (draft.zoneId === undefined || draft.zoneId.trim() === "") {
    violations.push("zoneId.required");
  } else if (
    !curatedZones.some((zone) => zone.id === draft.zoneId && zone.cityId === draft.cityId)
  ) {
    // D5 at the application boundary. The database refuses this pairing too,
    // through `listing`'s composite foreign key — but a constraint violation
    // surfaces as a 500, and this is a form error the publisher can fix.
    // Both layers are wanted: this one explains, that one guarantees.
    violations.push("zoneId.notInCity");
  }

  // `rooms` and `area_m2` are NOT NULL in the schema. They were declared on
  // `DraftListing` from the first version of this file and never checked,
  // which meant a draft missing either passed validation and failed at the
  // INSERT — a 500 where the publisher deserved a field error. Whole positive
  // numbers for the same reason the price is: the row layout renders "2 hab ·
  // 78 m²", and neither half has room for a fraction.
  //
  // A studio is one room, not zero. Zero is refused deliberately: `area_m2`
  // already carries the size, and a zero here reads as "unknown" wherever it
  // is rendered.
  if (draft.rooms === undefined) {
    violations.push("rooms.required");
  } else if (!isWholePositiveNumber(draft.rooms)) {
    violations.push("rooms.invalid");
  }

  if (draft.areaM2 === undefined) {
    violations.push("areaM2.required");
  } else if (!isWholePositiveNumber(draft.areaM2)) {
    violations.push("areaM2.invalid");
  }

  if (!draft.photoCount || draft.photoCount < 1) {
    violations.push("photos.required");
  } else if (draft.photoCount > MAX_PHOTOS_PER_LISTING) {
    violations.push("photos.tooMany");
  }

  return violations;
}
