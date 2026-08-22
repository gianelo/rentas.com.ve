import type { SitemapListing } from "../../domain/sitemap";

/**
 * De dónde salen las direcciones que se le entregan a Google (tarea 11.13).
 *
 * **Un solo método, y eso es la garantía.** No existe un `allZones()`, así que
 * una página de zona sin un solo aviso activo **no es expresable** en el
 * sitemap: `buildSitemap` deriva las zonas de los avisos que recibe. Es la
 * misma forma de garantía que `ListingPhotosPort` sostiene con `coversFor`
 * (plural, sin singular al lado, para que el N+1 no se pueda escribir) y que
 * `ListingSearchPort` sostiene con su `cityId` obligatorio.
 *
 * Lo que eso compra: nunca invitamos a un rastreador a una dirección que
 * responde "todavía no hay avisos publicados acá". Ese es contenido delgado
 * publicado por nosotros mismos, y a diferencia del que llega por accidente,
 * éste lo estaríamos enviando a mano.
 *
 * **Vencido significa fuera** (tarea 11.9). No es lo mismo que la búsqueda,
 * donde el estado se filtra para no gastar el mensaje de un inquilino; acá se
 * filtra porque una dirección que responde "este aviso venció" no tiene nada
 * que hacer en un documento cuyo único propósito es decir "esto vale la pena
 * rastrear".
 */
export interface SitemapPort {
  activeListings(): Promise<readonly SitemapListing[]>;
}
