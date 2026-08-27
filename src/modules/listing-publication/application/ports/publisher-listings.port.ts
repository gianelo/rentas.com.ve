import type { PublisherListing } from "../../domain/publisher-listing-board";

/**
 * tasks.md 9.28 — «mis avisos por publicador», la consulta que `app/mis-
 * avisos/page.tsx` dejó escrito que no existía todavía y por la que su lista
 * real nunca se dibujó.
 *
 * **Un puerto de LECTURA al lado de los otros, no un ensanche de ninguno**
 * (AGENTS.md §3, la misma razón que `ListingActivationPort` ya documenta).
 * `ListingRepositoryPort.save` inserta; `ListingActivationPort.findDraftById`
 * lee UN borrador por id para volver a validarlo; esto lista los avisos de
 * una cuenta con lo que hace falta para dibujarlos. Son tres preguntas
 * distintas sobre la misma tabla, y meter la tercera en cualquiera de las
 * otras dos obligaría a sus llamadores a cargar una forma que no usan.
 *
 * **El `publisherId` es del llamador, y el llamador lo saca de la sesión.**
 * `listPublisherListings` es el único que llama a este método y le pasa
 * `session.userId`; el puerto no tiene una versión sin filtro, así que «todos
 * los avisos de todos» no es una consulta que este puerto sepa hacer.
 */
export type PublisherListingRow = PublisherListing;

export interface PublisherListingsPort {
  /**
   * Todos los avisos de esa cuenta, en cualquier estado — el filtrado por
   * ficha lo hace el dominio, porque las cuentas de las seis fichas de 14d
   * necesitan verlos todos a la vez y seis consultas por pantalla serían seis
   * viajes para dibujar un encabezado.
   *
   * **Sin paginación, y es una decisión con fecha de vencimiento.** La lámina
   * dibuja 88 avisos y corta con «Ver los 38 borradores»; a esa escala una
   * sola consulta es más barata que el mecanismo. Una cuenta con miles la
   * necesitará, y ése es un cambio a esta firma, no un agujero que este
   * comentario deja abierto sin decirlo.
   */
  listByPublisher(publisherId: string): Promise<readonly PublisherListingRow[]>;
}
