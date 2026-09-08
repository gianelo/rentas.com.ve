import type { CatalogueCity, CatalogueZone } from "../../domain/catalogue";

/**
 * Read access to the curated taxonomy, and the reason this port exists at all.
 *
 * `ZoneCataloguePort` (listing-publication) already covered "the zones of one
 * city", which is what validating a draft needs. It could not serve the read
 * path: the search filters and the publish form both render **every** city and
 * the zones of the selected one, and there was no port shaped like that. So
 * three files in `app/` wrote raw Drizzle instead — the same `select` copied
 * into `app/page.tsx` and `app/publicar/page.tsx`, and a third in
 * `app/publicar/actions.ts`.
 *
 * That duplication was the symptom. The cause was a missing port, and this is
 * it. The rule it restores is `design.md`'s, not a preference: `app/` is a
 * delivery adapter that translates a request into a call, and a page holding a
 * hand-written query is a page that has become infrastructure.
 *
 * **Two methods, both unfiltered, and the narrowing is the domain's job.**
 * `zonesForCity` is a pure function over these rows. A `listZonesForCity`
 * here would look tighter and would be worse: the caller would then have to
 * be told which city, before the rule that decides which city has run.
 *
 * **The indexed route lookup lives in its own port, `ZoneRoutePort`
 * (`zone-route.port.ts`), and not here.** Every caller of this port today —
 * bulk import's zone resolution, `suggest-active-listings` — only ever needs
 * `listCities`/`listZones`, and every one of them fakes this interface as a
 * plain object literal. Adding a required method here would force each of
 * those fakes to implement a query they never call, which is exactly the
 * "a rule the caller can forget/a shape the caller must satisfy for no
 * reason" this design already argues against elsewhere. `DrizzleCatalogue`
 * implements both ports; a caller asks for the one it needs.
 */
export interface CataloguePort {
  listCities(): Promise<readonly CatalogueCity[]>;
  listZones(): Promise<readonly CatalogueZone[]>;
}
