import {
  type ContactMessageEvaluation,
  type ContactMessageInput,
  composeContactNotice,
  evaluateContactMessage,
} from "../domain/contact-message";
import type { ContactMailerPort } from "./ports/contact-mailer.port";

/**
 * "Escribinos" (tasks.md 23.7) — el caso de uso que junta las dos mitades:
 * qué es seguro enviar (`evaluateContactMessage`, dominio) y por dónde sale
 * (`ContactMailerPort`, infraestructura).
 *
 * **Ninguna decisión de producto vive acá.** Igual que `reportarAviso`,
 * este archivo sólo traduce: valida, compone si hace falta, envía si hace
 * falta, y devuelve el mismo veredicto que el dominio ya dio para que quien
 * llama (la Server Action) decida a qué pantalla redirigir.
 */

export type SendContactMessageResult = ContactMessageEvaluation;

export interface SendContactMessageDependencies {
  readonly mailer: ContactMailerPort;
}

export async function sendContactMessage(
  input: ContactMessageInput,
  deps: SendContactMessageDependencies,
): Promise<SendContactMessageResult> {
  const evaluation = evaluateContactMessage(input);
  if (evaluation.kind !== "valid") return evaluation;

  await deps.mailer.send(composeContactNotice(input));

  return evaluation;
}
