import { listingContactIsVerified } from "../domain/contact-verification";
import type { ListingContactVerificationPort } from "./ports/verified-contact.port";

/**
 * tasks.md 22.39 — la composición que la 22.32 dejó pendiente a propósito.
 *
 * **Las dos mitades ya existían y estaban probadas por separado, y ningún
 * llamador de producción las juntaba** (hallazgo `R3-uncomposed-halves`, de
 * una revisión de fiabilidad de Gentle AI que quemó sus artefactos al
 * reconocerse). `ListingContactVerificationPort.findVerifiedAt` trae el
 * instante crudo; `listingContactIsVerified` decide vigencia. Un dominio
 * completo, probado y sin llamador es indistinguible de uno que funciona —la
 * misma lección que la 22.31 ya nombró—, así que esto es lo único que las
 * junta detrás de UN llamador real: `contactDoorFor` (`sign-in-door.ts`),
 * que la puerta de entrar usa para decidir si dibuja «verificado por …» al
 * lado del contacto tapado (láminas Ficha 8b/9b).
 *
 * **`now` es obligatorio y en forma de función**, la misma disciplina que
 * `resolveContactVerification` ya aplica y por la misma razón: un valor por
 * omisión dejaría compilar un llamador que se olvidó de la ventana de doce
 * meses de la 19.11, y nadie se enteraría.
 */
export interface IsListingContactVerifiedDependencies {
  readonly verification: ListingContactVerificationPort;
  readonly now: () => Date;
}

export async function isListingContactVerified(
  listingId: string,
  dependencies: IsListingContactVerifiedDependencies,
): Promise<boolean> {
  const verifiedAt = await dependencies.verification.findVerifiedAt(listingId);
  return listingContactIsVerified(verifiedAt, dependencies.now());
}
