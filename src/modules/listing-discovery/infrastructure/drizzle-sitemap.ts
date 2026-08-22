import { and, eq, gt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { cities, listings, zones } from "../../../shared/db/schema";
import type { SitemapPort } from "../application/ports/sitemap.port";
import type { SitemapListing } from "../domain/sitemap";

export type SitemapDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export class DrizzleSitemap implements SitemapPort {
  constructor(private readonly db: SitemapDatabase) {}

  /**
   * Una consulta, dos joins. Las zonas no se consultan: `buildSitemap` las
   * deriva de estas mismas filas.
   *
   * **Las DOS condiciones de vigencia, y no una.** `status = 'active'` es la
   * que usa la búsqueda, pero ese estado lo mueve un trabajo programado, y un
   * trabajo programado se atrasa. Entre que un aviso vence y que el cron lo
   * marca, su fila sigue diciendo `active` — y el sitemap estaría invitando a
   * Google a una página que ya se dibuja como vencida. `expires_at > now()` es
   * lo que cierra esa ventana, y es barato: la misma fila ya está en memoria.
   *
   * Al revés que la ficha, que **sí** sirve un aviso vencido porque tiene un
   * estado dibujado para él. Servir no es lo mismo que recomendar.
   */
  async activeListings(): Promise<readonly SitemapListing[]> {
    const rows = await this.db
      .select({
        id: listings.id,
        cityName: cities.name,
        zoneName: zones.name,
        title: listings.title,
        publishedAt: listings.publishedAt,
      })
      .from(listings)
      .innerJoin(cities, eq(cities.id, listings.cityId))
      .innerJoin(zones, eq(zones.id, listings.zoneId))
      .where(and(eq(listings.status, "active"), gt(listings.expiresAt, sql`now()`)))
      // El más reciente primero: si algún día hay que cortar en 50.000, lo que
      // se pierde es lo viejo y no lo recién publicado.
      .orderBy(sql`${listings.publishedAt} desc`);

    return rows as unknown as readonly SitemapListing[];
  }
}
