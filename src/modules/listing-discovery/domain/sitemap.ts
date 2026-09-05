import type { FooterLinkDefinition } from "../../site-footer/domain/footer-links";
import { buildListingPath, slugify } from "./listing-url";

/**
 * Qué direcciones se le entregan a Google (tarea 11.13).
 *
 * **Es una regla de negocio, no un formateo**, y por eso vive acá y no en
 * `app/sitemap.ts`: decide qué existe a ojos de un buscador. La regla
 * permanente del fundador — una regla de negocio nunca vive en el frente —
 * aplica igual acá que en `zone-route.ts`, y hay además una razón práctica: el
 * suelo de cobertura del 90 % llega a `domain/` y no llega a `app/`.
 *
 * **Las páginas de zona se DERIVAN de los avisos activos, y esa es la decisión
 * de diseño entera.** Por eso `SitemapPort` tiene un solo método. Con una
 * consulta aparte para las zonas, las dos listas pueden discrepar y el sitemap
 * termina invitando a Google a una dirección que responde "todavía no hay
 * avisos publicados acá" — contenido delgado, publicado por nosotros mismos,
 * sobre el dominio entero. Derivándolas, una zona sólo puede aparecer si hay
 * un aviso suyo en el mismo documento. La garantía es estructural, no una
 * condición que alguien tenga que recordar.
 *
 * **Google acepta hasta 50.000 direcciones por sitemap.** No hay tope escrito
 * en el código porque no hay nada que truncar todavía; cuando el catálogo se
 * acerque, la respuesta es un índice de sitemaps, no un `slice` silencioso.
 */

/** Lo mínimo que esta regla necesita de un aviso activo. */
export interface SitemapListing {
  readonly id: string;
  readonly cityName: string;
  readonly zoneName: string;
  readonly title: string;
  readonly publishedAt: Date;
}

export interface SitemapEntry {
  readonly url: string;
  /**
   * Ausente cuando no hay nada de dónde derivarla.
   *
   * La alternativa era `new Date()`, y tiene dos costos: vuelve la función
   * impura — su test deja de ser repetible — y le dice a Google que la página
   * cambió cada vez que un rastreador pasa, que es exactamente la señal que
   * hace que deje de creerle al campo.
   */
  readonly lastModified?: Date;
  /**
   * `"monthly"` was added for task 23.9: the five Ayuda pages are static
   * content with no natural "modified" date, so they get the loosest
   * frequency the domain declares rather than a borrowed "weekly"/"daily"
   * that would overstate how often they actually change.
   */
  readonly changeFrequency: "daily" | "weekly" | "monthly";
}

/**
 * Which footer destinations enter the sitemap, and which never do (task
 * 23.9, decided by the founder on 2026-09-04). Ayuda answers real searches
 * and is an acquisition surface, so its pages are the only ones this
 * function returns; Legal is a trust surface and stays out of the sitemap
 * ON PURPOSE — never because it is hidden from the index (it still carries
 * no `noindex`, the same argument task 23.5 uses against a placeholder), but
 * because it should earn its own crawl path from links, not from being
 * listed at the same weight as content built to answer a search.
 *
 * Reads `FOOTER_LINK_CATALOGUE` (site-footer's single source of truth for
 * these ten destinations) instead of naming its own list of five paths, so
 * a page that is not live yet (`href: null`) cannot be sitemapped before it
 * exists — the same guarantee this file already gives listing zone pages.
 */
export function ayudaSitemapPaths(
  footerCatalogue: readonly FooterLinkDefinition[],
): readonly string[] {
  return footerCatalogue
    .filter(
      (entry): entry is FooterLinkDefinition & { href: string } =>
        entry.category === "ayuda" && entry.href !== null,
    )
    .map((entry) => entry.href);
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function newest(dates: readonly Date[]): Date | undefined {
  return dates.reduce<Date | undefined>(
    (latest, date) => (latest === undefined || date > latest ? date : latest),
    undefined,
  );
}

export function buildSitemap(
  baseUrl: string,
  listings: readonly SitemapListing[],
  // Task 23.9. Defaults to empty so an existing caller that has not learned
  // about Ayuda pages yet keeps its old behaviour unchanged.
  ayudaPaths: readonly string[] = [],
): readonly SitemapEntry[] {
  // Ruidoso y a propósito, igual que `readPhotoPublicBaseUrl`. Con la base
  // vacía el documento sale con direcciones relativas (`/alquiler/…`), y un
  // sitemap con direcciones relativas Google lo descarta ENTERO — sin un solo
  // error visible de nuestro lado.
  const base = baseUrl.trim();
  if (base === "") {
    throw new Error("listing-discovery: falta la base del sitio, y sin ella el sitemap no sirve.");
  }

  const entries: SitemapEntry[] = [
    {
      url: base.replace(/\/+$/, ""),
      lastModified: newest(listings.map((listing) => listing.publishedAt)),
      changeFrequency: "daily",
    },
  ];

  // Task 23.9 — no `lastModified`: same reasoning as the home entry above
  // when there is nothing to derive a date from. These are static content
  // pages; inventing `new Date()` would make the sitemap lie about churn.
  for (const path of ayudaPaths) {
    entries.push({ url: joinUrl(base, path), changeFrequency: "monthly" });
  }

  // La ciudad va en la clave junto a la zona: `Centro` existe en Maracaibo y en
  // Distrito Capital, y agrupar sólo por nombre de zona colapsaría las dos en
  // una dirección — la mitad de los avisos desaparecería del sitemap sin que
  // nada fallara.
  const zoneDates = new Map<string, Date>();
  for (const listing of listings) {
    const path = `/alquiler/${slugify(listing.cityName)}/${slugify(listing.zoneName)}`;
    const current = zoneDates.get(path);
    if (current === undefined || listing.publishedAt > current) {
      zoneDates.set(path, listing.publishedAt);
    }
  }

  for (const [path, lastModified] of zoneDates) {
    // Diaria: la zona cambia cada vez que alguien publica en ella, y es la
    // página que queremos que Google revisite.
    entries.push({ url: joinUrl(base, path), lastModified, changeFrequency: "daily" });
  }

  for (const listing of listings) {
    entries.push({
      // La MISMA función que arma el enlace de la tarjeta y contra la que la
      // ficha se redirige. Que las tres direcciones salgan de acá es lo que
      // impide que el sitemap publique una variante que la ficha responde con
      // un redirect — un rastreo entero gastado en saltos.
      url: joinUrl(base, buildListingPath(listing)),
      lastModified: listing.publishedAt,
      // Semanal: un aviso publicado no cambia de contenido. Lo que cambia es
      // si sigue vivo, y de eso se encarga salir del sitemap al vencer.
      changeFrequency: "weekly",
    });
  }

  // Defensivo y barato. Un sitemap con direcciones repetidas es una señal de
  // baja calidad, y la repetición puede entrar por datos — dos avisos con el
  // mismo id no deberían existir, pero el documento no es el lugar donde
  // enterarse.
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}
