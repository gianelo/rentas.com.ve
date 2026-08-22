/**
 * The curated city/zone taxonomy, and the two rules that read it.
 *
 * **Why this is its own capability rather than a corner of listing-search.**
 * Three surfaces need the catalogue — the search filters, the publish form,
 * and the publish action's zone check — and before this module each one
 * reached past every port and wrote its own Drizzle query against
 * `citiesTable`/`zonesTable`. That is what `design.md` forbids in one line:
 * "the Next.js `app/` tree is a thin delivery adapter that only translates
 * HTTP/RSC into a use case call — no business rule lives there." Putting the
 * catalogue inside listing-search would have made listing-publication depend
 * on search to know what a zone is, which is worse than the duplication it
 * replaced.
 *
 * Zones are curated by the founder, no free text anywhere in the product
 * (design.md D5). Everything here is a pure function over rows somebody else
 * fetched, so the rules stay provable without a database.
 */

export interface CatalogueCity {
  readonly id: string;
  readonly name: string;
}

export interface CatalogueZone {
  readonly id: string;
  readonly name: string;
  readonly cityId: string;
}

/**
 * Which city the visitor is actually looking at.
 *
 * **Two rules in one function, and both used to be missing.**
 *
 * The fallback was `params.city ?? cities[0]?.id`, written inside
 * `app/page.tsx` — a product decision ("what does someone see before they
 * choose?") taken by whatever `ORDER BY name` happened to return first. It is
 * still the catalogue's first city, but now that is a stated rule in one
 * place instead of an accident in a page, and changing it does not mean
 * editing a component.
 *
 * The membership check did not exist at all. `buildSearchCriteria` puts this
 * value directly into `WHERE city_id = $1` without verifying it, so
 * `?city=cualquier-cosa` rendered an empty results page for a catalogue full
 * of listings — indistinguishable, to the visitor, from "there is nothing
 * here". An id that is not curated is not a city, and the honest answer is
 * the default rather than the forgery.
 *
 * Compared exactly, never case-folded: these ids are `text` in Postgres and
 * `text` compares exactly, so accepting a different case here would hand back
 * an id that can never match a row while looking correct in a log.
 *
 * `null` means the product has not launched anywhere. The page must say so —
 * inventing an id would push a guaranteed-empty query at the database.
 */
export function resolveSelectedCity(
  cities: readonly CatalogueCity[],
  requestedCityId: string | null | undefined,
): string | null {
  const requested = requestedCityId?.trim();

  if (requested && cities.some((city) => city.id === requested)) {
    return requested;
  }

  return cities[0]?.id ?? null;
}

/**
 * D5 applied to the read path: the zones of exactly one city.
 *
 * The zone selector used to render the whole taxonomy at once, grouped into
 * an `<optgroup>` per city, so choosing Maracaibo still offered Chacao. That
 * filter now happens here rather than inside the component, because the
 * founder's standing rule is that a business rule never lives in the front
 * (2026-08-21) — and because a rule in a component is a rule the 90% coverage
 * floor does not reach.
 *
 * An unknown or absent city yields **nothing, never everything**. The
 * dangerous failure mode is the generous one: a filter that gives up and
 * returns the full taxonomy puts both cities back into the control, which is
 * the exact leak this function exists to close.
 */
export function zonesForCity(
  zones: readonly CatalogueZone[],
  cityId: string | null | undefined,
): readonly CatalogueZone[] {
  if (!cityId) return [];

  return zones.filter((zone) => zone.cityId === cityId);
}
