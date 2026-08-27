import type { SessionPort } from "../../identity/application/ports/session.port";
import { requireAuthenticatedSession } from "../../identity/application/require-authenticated-session";
import {
  buildPublisherListingBoard,
  type PublisherListingBoard,
  parsePublisherListingFilter,
} from "../domain/publisher-listing-board";
import type { PublisherListingsPort } from "./ports/publisher-listings.port";

/**
 * tasks.md 9.28 — lo que «Mis avisos» pregunta.
 *
 * **La regla que sólo este archivo puede tener.** El tablero es puro y no
 * sabe de quién son los avisos que recibe; el puerto lista los de la cuenta
 * que le nombren. La afirmación «una cuenta ve sus avisos y sólo los suyos»
 * vive exactamente en la línea de abajo, donde el id sale de la sesión y de
 * ningún parámetro — el pedido no tiene forma de nombrar una cuenta, que es
 * más fuerte que validarla.
 *
 * **Sesión primero, antes de cualquier lectura**, el mismo orden que
 * `activateListing`, `attachPhotoToDraft`, `publishListing` y `reportListing`
 * ya usan: quien no está adentro no puede hacer que esta función toque la
 * base.
 */

export interface ListPublisherListingsRequest {
  /** Crudo, tal como viene de la dirección. El dominio lo interpreta y falla cerrado. */
  readonly filter?: string;
}

export interface ListPublisherListingsDependencies {
  readonly sessionPort: SessionPort;
  readonly listings: PublisherListingsPort;
  readonly now?: () => Date;
}

export async function listPublisherListings(
  request: ListPublisherListingsRequest,
  dependencies: ListPublisherListingsDependencies,
): Promise<PublisherListingBoard> {
  const { sessionPort, listings } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  const session = await requireAuthenticatedSession(sessionPort);

  const rows = await listings.listByPublisher(session.userId);

  return buildPublisherListingBoard(rows, now(), parsePublisherListingFilter(request.filter));
}
