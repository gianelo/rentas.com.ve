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
  | "photos.required";

/**
 * SISTEMA.md screen 3 ships a live counter against this exact number. The
 * constant is exported so the form can render the counter from the same
 * source the validator enforces — two copies of "120" is how a counter comes
 * to disagree with the rule it is counting toward.
 */
export const MIN_DESCRIPTION_CHARACTERS = 120;

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

  if (!draft.photoCount || draft.photoCount < 1) {
    violations.push("photos.required");
  }

  return violations;
}
