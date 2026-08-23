import { buildListingPath, type ListingUrlParts } from "./listing-url";
import { withResultsOrigin } from "./return-to-results";

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
  /**
   * De dónde vino quien mira (16.9). No participa de la canonicalización — es
   * estado de la visita, no de la dirección del aviso — pero **tiene que
   * sobrevivir a la redirección**: perderlo acá deja sin vuelta justo a quien
   * llegó desde una búsqueda con el título viejo, que es el enlace que circula
   * por WhatsApp. Opcional porque una ficha abierta desde Google no lo trae.
   */
  resultsOrigin?: string | readonly string[],
): ListingRouteResolution {
  const canonical = buildListingPath(listing);

  // **La query se descarta ANTES de comparar, y de ahí sale que no haya
  // bucle.** Adentro de la comparación, la ruta canónica *con* el parámetro de
  // vuelta nunca sería igual a la canónica y la ficha se redirigiría a sí
  // misma para siempre — un bucle que sólo aparece llegando desde una
  // búsqueda, es decir, en el camino normal del producto. La barra final se
  // quita por el mismo motivo de siempre: es la misma ruta escrita distinto, y
  // tratarla como otra duplicaría cada aviso por dos.
  const requested = requestedPath.split(/[?#]/)[0]?.replace(/\/+$/, "") ?? "";

  return requested === canonical
    ? { kind: "render" }
    : // `withResultsOrigin` valida antes de escribir, así que un origen hostil
      // no se cuelga del destino de la redirección.
      { kind: "redirect", to: withResultsOrigin(canonical, resultsOrigin) };
}
