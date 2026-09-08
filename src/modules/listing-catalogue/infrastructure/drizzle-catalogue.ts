import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alias } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { cities, zones } from "../../../shared/db/schema";
import type { CataloguePort } from "../application/ports/catalogue.port";
import type { ZoneRouteCandidates, ZoneRoutePort } from "../application/ports/zone-route.port";
import type { CatalogueCity, CatalogueZone } from "../domain/catalogue";

/**
 * The database handle is injected rather than imported, following
 * `DrizzleZoneCatalogue`: the deployment hands it a Neon client and the
 * integration test hands it a `node-postgres` client pointed at a real
 * container, and both run this exact code.
 */
export type CatalogueDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export class DrizzleCatalogue implements CataloguePort, ZoneRoutePort {
  constructor(private readonly db: CatalogueDatabase) {}

  /**
   * Ordered by name, and that ordering is now load-bearing rather than
   * cosmetic: `resolveSelectedCity` takes the first city as the default a
   * visitor sees before choosing one. It is stated in the domain as "the
   * catalogue's first city", so the sort belongs to the query that produces
   * the catalogue — but changing it here changes what the country's capital
   * city looks like on the site's root, which is why this comment exists.
   */
  async listCities(): Promise<readonly CatalogueCity[]> {
    return this.db
      .select({ id: cities.id, name: cities.name })
      .from(cities)
      .orderBy(asc(cities.name));
  }

  /**
   * **No join against `city`, and that is a correction rather than an
   * omission.** This method shipped with an `innerJoin` copied from
   * `DrizzleZoneCatalogue`, whose comment says it stops a zone whose city has
   * been removed from reaching a caller. Checked against the migration that
   * actually ran: `zone_city_id_city_id_fk` is `ON DELETE cascade`
   * (drizzle/0001), so Postgres deletes the zones with the city. The orphan
   * the join defended against cannot exist, and a join on every page load to
   * guard an unreachable state is cost with no buyer.
   *
   * The guarantee is the foreign key, not a `WHERE` this code could forget.
   *
   * **`kind`/`category`/`parentName` added for broker-bulk-import's
   * name-resolution layer** (`resolve-import-locations.ts`), which needs
   * enough of the taxonomy shape to tell a broker WHICH places an ambiguous
   * name matches — the same self-join `DrizzleZoneVocabulary.lookup` already
   * runs (`listing-publication/infrastructure/drizzle-zone-vocabulary.ts`),
   * reused here rather than re-derived: one `parent` alias, one `leftJoin`.
   */
  async listZones(): Promise<readonly CatalogueZone[]> {
    const parent = alias(zones, "parent");

    return this.db
      .select({
        id: zones.id,
        name: zones.name,
        cityId: zones.cityId,
        kind: zones.kind,
        category: zones.category,
        parentName: parent.name,
      })
      .from(zones)
      .leftJoin(parent, eq(zones.parentId, parent.id))
      .orderBy(asc(zones.name));
  }

  /**
   * The indexed lookup tasks.md 27.1 (slice B) adds so
   * `/alquiler/<ciudad>/<zona>` stops paying for `listCities()` +
   * `listZones()` — the entire taxonomy — to answer a two-segment question.
   *
   * **Two queries, not one join, and that is deliberate.** `city` has ~18
   * rows; folding it into the zone query's `WHERE` would still need a second
   * round trip to fail closed on an unknown city (`null`, never a stray
   * zone). Reading it first is also what makes "the city segment does not
   * name a curated city" a clean early return instead of an empty-vs-absent
   * ambiguity on the joined result.
   *
   * **The zone query is scoped by BOTH `city_id` and `slug`, and returns the
   * whole set — never `LIMIT 1`.** `resolveZoneRoute` still decides what a
   * valid route is; picking one row here would silently reintroduce the
   * exact ambiguity the 27.7 port shape exists to carry forward. See
   * `ZoneRouteCandidates` for why the caller receives an array.
   */
  async findZoneBySlug(citySlug: string, zoneSlug: string): Promise<ZoneRouteCandidates | null> {
    const [city] = await this.db
      .select({ id: cities.id, name: cities.name })
      .from(cities)
      .where(eq(cities.slug, citySlug))
      .limit(1);

    if (!city) return null;

    const parent = alias(zones, "parent");
    const zoneRows = await this.db
      .select({
        id: zones.id,
        name: zones.name,
        cityId: zones.cityId,
        kind: zones.kind,
        category: zones.category,
        parentName: parent.name,
      })
      .from(zones)
      .leftJoin(parent, eq(zones.parentId, parent.id))
      .where(and(eq(zones.cityId, city.id), eq(zones.slug, zoneSlug)))
      .orderBy(asc(zones.name));

    return { city, zones: zoneRows };
  }
}
