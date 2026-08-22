/**
 * El origen absoluto del sitio, para los documentos que no admiten una ruta
 * relativa: `sitemap.xml` y `robots.txt`.
 *
 * Se lee acá y no en el dominio porque `process.env` es infraestructura —
 * `buildSitemap` recibe la base como argumento justamente para poder probarse
 * sin un entorno, igual que `photoUrl`.
 *
 * **No lanza, al revés que `readPhotoPublicBaseUrl`, y la asimetría es
 * deliberada.** Aquélla protege una pantalla que sin la variable dibuja veinte
 * íconos rotos. Ésta sirve a un rastreador: fallar dejaría el sitio entero sin
 * sitemap por una variable de entorno faltante, cuando el dominio de
 * producción es un dato conocido y estable. Se prefiere una cadena de
 * respaldos explícita a un 500.
 */
const PRODUCTION_ORIGIN = "https://rentas.com.ve";

export function readSiteBaseUrl(env: Record<string, string | undefined> = process.env): string {
  // 1. Configuración explícita. Es la única que gana, y existe para que un
  //    despliegue en otro dominio no tenga que tocar código.
  const configured = env.SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  // 2. La vista previa de Vercel. Sin esto, cada rama publicaría un sitemap
  //    que apunta a producción, y un rastreador que la encuentre indexaría
  //    direcciones de producción desde un dominio que no es el nuestro.
  const preview = env.VERCEL_URL?.trim();
  if (preview) return `https://${preview.replace(/\/+$/, "")}`;

  // 3. El dominio del producto. Es el nombre del repositorio.
  return PRODUCTION_ORIGIN;
}
