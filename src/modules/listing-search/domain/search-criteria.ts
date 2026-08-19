/**
 * What a search IS, decided before anything touches the database
 * (tasks.md 5.0/5.1, design.md D5).
 *
 * Query parameters arrive as text a visitor can hand-edit and as state a
 * GET form kept from the previous page; this turns that into the only shape
 * `ListingSearchPort.search` accepts.
 *
 * **The stale-zone rule is why this exists as a separate step.**
 * `components/molecules/CityZoneSelect.tsx` records the mechanism: a GET
 * form submits whatever its controls currently hold, so switching city
 * without touching the zone select sends the *previous* city's zone —
 * `?city=<maracaibo>&zone=<a caracas zone>`. Nothing is written, so D5's
 * composite foreign key is not involved and cannot help. Passing that pair
 * to SQL would be technically correct and a product failure: `city_id = A
 * AND zone_id = B` matches nothing, and the visitor sees an empty page for
 * a city full of listings with no way to tell why. The zone is dropped,
 * because the city is what they just chose and the zone is leftover state
 * they never saw.
 */

export interface CuratedZone {
  readonly id: string;
  readonly cityId: string;
}

/** Query parameters, exactly as a URL hands them over. */
export interface RawSearchParams {
  readonly city?: string | null;
  readonly zone?: string | null;
  readonly minPrice?: string | null;
  readonly maxPrice?: string | null;
  readonly minRooms?: string | null;
  readonly minAreaM2?: string | null;
}

/**
 * `cityId` is required and non-nullable — D5's second layer. Every other
 * field is optional, so a criteria object that exists is always scoped to
 * exactly one city; there is no value to pass that means "everywhere".
 */
export interface SearchCriteria {
  readonly cityId: string;
  readonly zoneId?: string;
  readonly minPriceUsd?: number;
  readonly maxPriceUsd?: number;
  readonly minRooms?: number;
  readonly minAreaM2?: number;
}

/** Whole, non-negative, and actually a number. Anything else is noise. */
function readCount(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
}

/**
 * `null` means **no search happened** — not "search every city". A visitor
 * who has not picked a city yet gets the city chooser, and this is the only
 * representable way to say that: there is no criteria object without a
 * scope, so no caller can accidentally construct an unscoped query.
 *
 * `zones` may be the entire curated taxonomy; membership is checked against
 * the submitted `cityId` here rather than trusting a pre-filtered list.
 * A caller that filtered by the wrong city would otherwise re-open exactly
 * the hole this function closes.
 *
 * OPEN QUESTION, recorded rather than hidden: a *silently* dropped zone is
 * the least-bad default, not a good one. The results page should say
 * "mostrando toda la ciudad" when it happens, and this signature gives it
 * no way to know. A `droppedZone` flag is the obvious fix, left for 5.7's
 * UI rather than guessed at before it has a reader.
 */
export function buildSearchCriteria(
  raw: RawSearchParams,
  zones: readonly CuratedZone[],
): SearchCriteria | null {
  const cityId = raw.city?.trim();
  if (!cityId) return null;

  const zoneId = raw.zone?.trim();
  const belongsToCity =
    zoneId !== undefined &&
    zoneId !== "" &&
    zones.some((zone) => zone.id === zoneId && zone.cityId === cityId);

  return {
    cityId,
    ...(belongsToCity ? { zoneId } : {}),
    ...maybe("minPriceUsd", readCount(raw.minPrice)),
    ...maybe("maxPriceUsd", readCount(raw.maxPrice)),
    ...maybe("minRooms", readCount(raw.minRooms)),
    ...maybe("minAreaM2", readCount(raw.minAreaM2)),
  };
}

/** Keeps absent filters absent instead of present-and-undefined. */
function maybe<K extends string>(key: K, value: number | undefined) {
  return value === undefined ? {} : ({ [key]: value } as Record<K, number>);
}
