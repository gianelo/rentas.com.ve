import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { listings } from "../../../shared/db/schema";
import type {
  ListingSearchPort,
  ListingSearchResult,
} from "../application/ports/listing-search.port";
import type { SearchCriteria } from "../domain/search-criteria";

/**
 * The catalogue read, run where the rows are (task 5.4/5.6).
 *
 * The handle is a constructor argument, not an import, so this exact code
 * runs against Neon in production and against a real Postgres container in
 * tests/integration/listing-search.test.ts (the reasoning is spelled out in
 * listing-publication/infrastructure/drizzle-listing-repository.ts).
 *
 * Two predicates are **unconditional**, and that is the whole design:
 * `city_id` and `status = 'active'` are appended before any caller-supplied
 * filter and cannot be omitted, because `cityId` is required on the criteria
 * and status is not on it at all. `listing_city_status_idx` is (city_id,
 * status), so the pair every query starts with is also the access path.
 *
 * No `LIMIT` yet, and this is the honest gap: two launch cities with a few
 * hundred adverts each fit in one response, and pagination without a real
 * row count is a guess at page size. It has to arrive before the catalogue
 * grows, and it belongs with the results UI (5.7) that will show it.
 */
export type SearchDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export class DrizzleListingSearch implements ListingSearchPort {
  constructor(private readonly db: SearchDatabase) {}

  async search(criteria: SearchCriteria): Promise<readonly ListingSearchResult[]> {
    const filters = [
      eq(listings.cityId, criteria.cityId),
      // The active-only rule (5.5/5.6). Expired adverts and adverts
      // auto-hidden by reports are the same case here: neither is something
      // a tenant should be able to reach through search.
      eq(listings.status, "active"),
    ];

    // A stale zone never arrives as a filter — `buildSearchCriteria` drops
    // one that does not belong to this city before it can get here.
    if (criteria.zoneId !== undefined) filters.push(eq(listings.zoneId, criteria.zoneId));
    if (criteria.minPriceUsd !== undefined) {
      filters.push(gte(listings.priceUsd, criteria.minPriceUsd));
    }
    if (criteria.maxPriceUsd !== undefined) {
      filters.push(lte(listings.priceUsd, criteria.maxPriceUsd));
    }
    if (criteria.minRooms !== undefined) filters.push(gte(listings.rooms, criteria.minRooms));
    if (criteria.minAreaM2 !== undefined) filters.push(gte(listings.areaM2, criteria.minAreaM2));

    return (
      this.db
        .select({
          id: listings.id,
          cityId: listings.cityId,
          zoneId: listings.zoneId,
          title: listings.title,
          priceUsd: listings.priceUsd,
          rooms: listings.rooms,
          areaM2: listings.areaM2,
          publisherType: listings.publisherType,
          publishedAt: listings.publishedAt,
        })
        .from(listings)
        .where(and(...filters))
        // Newest first, id as the tiebreak. Fixtures published inside the same
        // transaction share a `now()`, and an unordered query would then return
        // whichever row Postgres reached first — a test that passes on ordering
        // luck is the failure this project keeps finding.
        .orderBy(desc(listings.publishedAt), asc(listings.id))
    );
  }
}
