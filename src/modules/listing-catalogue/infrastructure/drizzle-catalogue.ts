import { asc } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { cities, zones } from "../../../shared/db/schema";
import type { CataloguePort } from "../application/ports/catalogue.port";
import type { CatalogueCity, CatalogueZone } from "../domain/catalogue";

/**
 * The database handle is injected rather than imported, following
 * `DrizzleZoneCatalogue`: the deployment hands it a Neon client and the
 * integration test hands it a `node-postgres` client pointed at a real
 * container, and both run this exact code.
 */
export type CatalogueDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export class DrizzleCatalogue implements CataloguePort {
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
   */
  async listZones(): Promise<readonly CatalogueZone[]> {
    return this.db
      .select({ id: zones.id, name: zones.name, cityId: zones.cityId })
      .from(zones)
      .orderBy(asc(zones.name));
  }
}
