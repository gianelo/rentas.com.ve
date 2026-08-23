import { renewedExpiry } from "../domain/expiry";
import { type RenewalTokenFailure, readRenewalToken } from "../domain/renewal-token";
import type { LifecycleListingsPort, RenewableListing } from "./ports/lifecycle-listings.port";

/**
 * El enlace de renovación, en sus dos mitades (tasks.md 7.8/7.9).
 *
 * **Son dos funciones y no una con una bandera**, porque la garantía es
 * justamente que una de las dos no puede escribir. `previewRenewal` es lo que
 * atiende el `GET`: valida el token, lee el aviso y devuelve qué mostrar. No
 * existe camino desde ahí hasta `renew`.
 *
 * Eso importa más de lo que parece: un enlace en un correo lo abre el
 * antivirus del proveedor, el previsualizador de WhatsApp y el prefetch del
 * navegador, todos con `GET` y sin que nadie haya hecho clic. Si el `GET`
 * renovara, el aviso se renovaría solo y el token quedaría quemado antes de
 * que la persona lo viera.
 */

export interface RenewListingRequest {
  readonly token: string;
}

export interface RenewListingDependencies {
  readonly listings: LifecycleListingsPort;
  readonly renewalSecret: string;
  readonly now?: () => Date;
}

export type RenewalPreview =
  | { readonly status: "ready"; readonly listing: RenewableListing }
  | { readonly status: "not-found" }
  | { readonly status: "invalid"; readonly reason: RenewalTokenFailure };

export type RenewalOutcome =
  | { readonly status: "renewed"; readonly expiresAt: Date }
  | { readonly status: "already-used" }
  | { readonly status: "invalid"; readonly reason: RenewalTokenFailure };

/** El `GET`. Lee y nada más. */
export async function previewRenewal(
  request: RenewListingRequest,
  dependencies: RenewListingDependencies,
): Promise<RenewalPreview> {
  const now = dependencies.now ?? (() => new Date());
  const token = readRenewalToken(request.token, dependencies.renewalSecret, now());
  if (!token.ok) return { status: "invalid", reason: token.reason };

  const listing = await dependencies.listings.findRenewable(token.payload.listingId);
  if (!listing) return { status: "not-found" };

  return { status: "ready", listing };
}

/**
 * El `POST`. Renueva +30 días y quema el token en la misma operación.
 *
 * **La quema no es un paso aparte.** `expectedExpiresAt` sale de lo que el
 * token firmó y viaja al `WHERE` del `UPDATE`: si el aviso ya se renovó, la
 * fila dejó de tener ese `expires_at` y el `UPDATE` afecta cero filas. Dos
 * clics simultáneos del mismo enlace no dan 60 días, y no hace falta ninguna
 * tabla de tokens quemados ni ninguna transacción explícita para conseguirlo.
 *
 * El id del aviso NUNCA sale del pedido: sale del token firmado. Un token
 * válido para un aviso no puede renovar otro aunque la URL diga lo contrario.
 */
export async function renewListing(
  request: RenewListingRequest,
  dependencies: RenewListingDependencies,
): Promise<RenewalOutcome> {
  const now = dependencies.now ?? (() => new Date());
  const renewedAt = now();

  const token = readRenewalToken(request.token, dependencies.renewalSecret, renewedAt);
  if (!token.ok) return { status: "invalid", reason: token.reason };

  const newExpiresAt = renewedExpiry(renewedAt);
  const renewed = await dependencies.listings.renew({
    listingId: token.payload.listingId,
    expectedExpiresAt: token.payload.expiresAt,
    newExpiresAt,
    renewedAt,
  });

  return renewed ? { status: "renewed", expiresAt: newExpiresAt } : { status: "already-used" };
}
