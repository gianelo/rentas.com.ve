import type { MetadataRoute } from "next";
import { buildSitemap } from "@/modules/listing-discovery/domain/sitemap";
import { DrizzleSitemap } from "@/modules/listing-discovery/infrastructure/drizzle-sitemap";
import { readSiteBaseUrl } from "@/modules/listing-discovery/infrastructure/site-base-url";
import { db } from "@/shared/db/client";

/**
 * **Nunca en tiempo de compilación, y esto no es una preferencia.**
 *
 * Next.js genera `sitemap.xml` estáticamente por defecto, lo que significa
 * ejecutar esta consulta durante `next build`. Dos razones por las que no
 * sirve acá, en orden de peso:
 *
 * 1. Un sitemap horneado en el build queda viejo con el primer aviso que se
 *    publique después del despliegue — que es todos los días. La página que
 *    más necesita estar al día sería la más desactualizada del sitio.
 * 2. El build de CI corre con una `DATABASE_URL` **inrouteable a propósito**
 *    (`.github/workflows/ci.yml`, trabajo `build`), para que un cambio que
 *    consulte durante el build se caiga en vez de pasar. Este archivo es
 *    exactamente ese cambio, y sin esta línea rompe el build.
 */
export const dynamic = "force-dynamic";

/**
 * El sitemap (tarea 11.13).
 *
 * Esta función no decide nada: pide, pregunta y devuelve. Qué entra, cómo se
 * arma cada dirección y de dónde sale la fecha de cada una lo decide
 * `buildSitemap`, en el dominio — la regla permanente del fundador, y también
 * la razón práctica de que el suelo de cobertura del 90 % llegue a `domain/` y
 * no llegue acá.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings = await new DrizzleSitemap(db).activeListings();

  return buildSitemap(readSiteBaseUrl(), listings) as MetadataRoute.Sitemap;
}
