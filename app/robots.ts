import type { MetadataRoute } from "next";
import { readSiteBaseUrl } from "@/modules/listing-discovery/infrastructure/site-base-url";

/**
 * `robots.txt`, y **lo que deliberadamente NO bloquea**.
 *
 * La tentación es listar acá las búsquedas refinadas (`/alquiler/…?min=250`),
 * que son combinatorias y no queremos en el índice. Sería un error, y de los
 * silenciosos: una dirección bloqueada por `robots.txt` **no se rastrea**, así
 * que Google nunca llega a leer su `noindex` — y una página ya indexada se
 * queda indexada para siempre, sin forma de sacarla. El mecanismo correcto es
 * el que ya usa `app/alquiler/[ciudad]/[zona]/page.tsx`: dejar que la rastree
 * y que la etiqueta le diga que no la publique.
 *
 * Bloquear es sólo para lo que no tiene ningún sentido rastrear.
 */
export default function robots(): MetadataRoute.Robots {
  const base = readSiteBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        // El camino de autenticación. No tiene contenido y cada rastreo suyo
        // es presupuesto gastado en una pantalla que pide entrar.
        "/signin",
        // El arnés de medición: existe sólo para las cotas de layout de
        // Playwright y se sirve únicamente con MEASURE_HARNESS_ENABLED.
        "/measure",
        // El flujo de publicación es privado por sesión y no rinde nada
        // indexado — quien quiere publicar llega por el botón, no por Google.
        "/publicar",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
