import {
  type ContactVerification,
  decideContactVerification,
} from "../domain/contact-verification";
import type {
  ContactVerificationEvidencePort,
  ContactVerificationQuery,
  VerifiedContactPort,
} from "./ports/verified-contact.port";

/**
 * tasks.md 19.9 / 19.10 — «publicar con un valor que ya tiene una fila viva
 * no pide nada; un valor nuevo se verifica y se registra».
 *
 * Tres líneas de orquestación y ninguna regla: leer la evidencia, preguntarle
 * al dominio, y escribir SÓLO cuando lo que se verificó ya ocurrió de verdad.
 *
 * **Lo que no hace es tan importante como lo que hace.** No corta la
 * publicación. Hoy `unverified` no tiene forma de resolverse —el canal de
 * WhatsApp está diferido al final del proyecto (fundador, 2026-08-29)—, así
 * que convertirlo en una puerta cerraría la publicación por teléfono para
 * todo el mundo, que es un retroceso de producto y no un cierre en falso. El
 * cierre en falso es el otro: sin fila, nada puede dibujar «verificado», y
 * eso lo garantiza la ausencia de la fila y no una rama de este archivo.
 */
export interface ResolveContactVerificationDependencies {
  readonly evidence: ContactVerificationEvidencePort;
  readonly verifiedContacts: VerifiedContactPort;
}

export async function resolveContactVerification(
  query: ContactVerificationQuery,
  dependencies: ResolveContactVerificationDependencies,
): Promise<ContactVerification> {
  const evidence = await dependencies.evidence.findEvidence(query);
  const decision = decideContactVerification(query.contact, evidence);

  // Sólo esta rama escribe. `already-verified` ya tiene su fila y volver a
  // escribirla movería un instante que nadie volvió a probar; `unverified` no
  // tiene nada que registrar, y registrar algo ahí sería exactamente el
  // agujero que la tabla existe para no dejar.
  if (decision.kind === "verified-by-account-email") {
    await dependencies.verifiedContacts.record({
      userId: query.userId,
      contact: query.contact,
      verifiedAt: decision.verifiedAt,
    });
  }

  return decision;
}
