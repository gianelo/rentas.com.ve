import { and, eq, gt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { cities, listings, zones } from "../../../shared/db/schema";
import type { SitemapPort } from "../application/ports/sitemap.port";
import { MIN_INDEXABLE_DESCRIPTION_LENGTH } from "../domain/listing-structured-data";
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
   *
   * **Y una tercera condición, el contenido delgado (11.15).** La ficha de un
   * aviso por debajo del umbral lleva `noindex`; dejarlo acá sería pedirle a
   * Google que indexe una página que la propia página le pide no indexar, y
   * eso Search Console lo reporta como un error del sitio. El número vive en
   * el dominio y se importa: lo que este SQL agrega es la misma medida escrita
   * para Postgres, y que las dos escrituras no se separen lo sostiene
   * `tests/integration/sitemap.test.ts`.
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
      .where(
        and(
          eq(listings.status, "active"),
          gt(listings.expiresAt, sql`now()`),
          // Colapsar y DESPUÉS recortar, en ese orden: `btrim` sin argumentos
          // sólo quita espacios, no saltos ni tabulaciones. Colapsando primero,
          // todo blanco ya es un espacio y el recorte alcanza — que es
          // exactamente lo que hace `contentLength` del otro lado.
          //
          // `[[:space:]]` y no `\s`: esto es una plantilla de JavaScript, y ahí
          // `\s` se come la barra invertida antes de que Postgres la vea. El
          // filtro quedaba buscando la letra `s` y no fallaba en ningún lado.
          sql`length(btrim(regexp_replace(${listings.description}, '[[:space:]]+', ' ', 'g')))
              >= ${MIN_INDEXABLE_DESCRIPTION_LENGTH}`,
        ),
      )
      // El más reciente primero: si algún día hay que cortar en 50.000, lo que
      // se pierde es lo viejo y no lo recién publicado.
      .orderBy(sql`${listings.publishedAt} desc`);

    return rows as unknown as readonly SitemapListing[];
  }
}
