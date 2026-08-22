import { buildListingPath, type ListingUrlParts } from "./listing-url";

/**
 * Decide si una ruta se sirve o se redirige — **y es la deuda que la tarea 11.1
 * dejó escrita cuando eligió que sólo el id identifica un aviso.**
 *
 * Aquella decisión dice: ciudad, zona y slug son para un rastreador y para
 * quien decide si tocar un enlace pegado en un grupo de WhatsApp; no tienen
 * poder de búsqueda, y no deben tenerlo, porque una URL que dejó de resolver
 * porque alguien corrigió una falta de ortografía es una URL que nunca valió la
 * pena indexar.
 *
 * Su costo quedó anotado ahí mismo: **como toda ruta que termina en el mismo id
 * resuelve al mismo aviso, servirlas todas publicaría URLs duplicadas sin
 * límite para un solo aviso.** Cada variante que alguien invente respondería
 * 200, Google las indexaría como páginas distintas con el mismo contenido, y
 * esa penalización cae sobre el dominio entero, no sobre una página.
 *
 * Esta función es la que paga esa deuda, y por eso es la pieza que no se puede
 * olvidar al construir la ficha.
 */

export type ListingRouteResolution =
  | { readonly kind: "render" }
  | { readonly kind: "redirect"; readonly to: string };

export interface ResolvableListing extends ListingUrlParts {}

export function resolveListingRoute(
  listing: ResolvableListing,
  requestedPath: string,
): ListingRouteResolution {
  const canonical = buildListingPath(listing);

  // La barra final no es otra ruta: es la misma escrita distinto, y tratarla
  // como diferente duplicaría cada aviso por dos.
  const requested = requestedPath.replace(/\/+$/, "");

  return requested === canonical ? { kind: "render" } : { kind: "redirect", to: canonical };
}
