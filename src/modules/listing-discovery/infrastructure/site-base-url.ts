/**
 * El origen absoluto del sitio, para los documentos que no admiten una ruta
 * relativa: `sitemap.xml` y `robots.txt`.
 *
 * Se lee acá y no en el dominio porque `process.env` es infraestructura —
 * `buildSitemap` recibe la base como argumento justamente para poder probarse
 * sin un entorno, igual que `photoUrl`.
 *
 * **Lanza, igual que `readPhotoPublicBaseUrl`, y antes no lo hacía.** Hasta la
 * fase 26 había un tercer respaldo codificado con el dominio de producción, y
 * su docblock lo defendía como una excepción deliberada al «fallar cerrado» de
 * AGENTS.md §7: fallar dejaría el sitio entero sin sitemap por una variable
 * faltante. Ese argumento no sobrevivió al dominio de verdad. En Vercel
 * `VERCEL_URL` viene siempre puesta (tasks.md 26.1), así que el tercer paso de
 * la cadena era inalcanzable en producción y su única función real era servir
 * a las pruebas y al desarrollo local — dos lugares donde un error ruidoso
 * vale más que un origen plausible. Con el respaldo afuera, una `SITE_URL`
 * faltante deja de emitir en silencio un sitemap que apunta a otro sitio.
 */
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

  // 3. No hay tercer paso. Adivinar el dominio publicaría un sitemap entero
  //    de direcciones que no son las nuestras, y un rastreador no lo reporta.
  throw new Error(
    "listing-discovery: falta SITE_URL, y sin ella no hay origen absoluto que poner en el sitemap.",
  );
}
