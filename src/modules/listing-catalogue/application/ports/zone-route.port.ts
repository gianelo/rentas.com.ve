import type { CatalogueCity, CatalogueZone } from "../../domain/catalogue";

/**
 * What `findZoneBySlug` resolves to: the ONE city the first URL segment
 * names, and the SET of zones the second segment names inside it (tasks.md
 * 27.1, slice B; 27.7).
 *
 * **Why a set and not a row.** The founder decided (2026-09-07, task 27.7)
 * that the zone route names a PLACE, not a row: `/alquiler/<ciudad>/<zona>`
 * has to reach every zone sharing that name inside that city, because 335
 * `(city_id, slug)` groups in the real taxonomy are genuinely distinct
 * parishes that happen to share a toponym — `Barrio Nuevo` in three
 * different parroquias of Maracaibo is the worked example. Shaping this port
 * around a single row now would force a second signature change the day
 * 27.7 lands; shaping it around the set costs nothing today and avoids that.
 *
 * **This slice does not act on the plural.** `resolveZoneRoute`
 * (listing-discovery) still picks one zone from the array it is handed —
 * same behaviour as before this slice, same latent ambiguity 27.7 measured
 * and will fix. What changes here is only WHERE that array comes from: an
 * indexed lookup instead of the entire taxonomy.
 */
export interface ZoneRouteCandidates {
  readonly city: CatalogueCity;
  readonly zones: readonly CatalogueZone[];
}

/**
 * The one query the zone route needs, kept out of `CataloguePort` on purpose.
 *
 * **Why its own port instead of a third method on `CataloguePort`.** Every
 * existing caller of `CataloguePort` — bulk import's zone resolution,
 * `suggest-active-listings` — fakes that interface as a plain object literal
 * typed against it, and none of them resolves a route. A required method
 * here would force every one of those fakes to implement a query they never
 * call, for a screen they do not render. `DrizzleCatalogue` implements both
 * interfaces on the same class; only `app/alquiler/[ciudad]/[zona]/page.tsx`
 * asks for this one.
 */
export interface ZoneRoutePort {
  /**
   * The city and zone candidates for `/alquiler/<citySlug>/<zoneSlug>`,
   * resolved through the `slug` index on `city` and `zone` (tasks.md 27.1,
   * slice B) instead of scanning the full taxonomy.
   *
   * `null` when no curated city has this slug. A `zones` array — possibly
   * empty, when the city exists but no zone of it matches — when it does.
   * `resolveZoneRoute` (listing-discovery) still owns what a valid route is;
   * this only narrows what reaches it.
   */
  findZoneBySlug(citySlug: string, zoneSlug: string): Promise<ZoneRouteCandidates | null>;
}
