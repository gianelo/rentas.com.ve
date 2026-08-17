import type { CuratedZone } from "../../domain/publishable-listing";

/**
 * Read access to the curated zone taxonomy (D5). Zones are a table the
 * founder maintains — there is no free-text zone anywhere in this product.
 *
 * Scoped to one city rather than exposing "list every zone". Validating a
 * single listing needs one city's zones, and a `listAll` would grow with the
 * catalogue every time a draft is checked. The narrower method is also the
 * one that makes `cityId.unknown` falsifiable: a city with no curated zone
 * comes back empty, which is exactly what "not a city this product launches
 * in" means.
 */
export interface ZoneCataloguePort {
  listZonesForCity(cityId: string): Promise<readonly CuratedZone[]>;
}
