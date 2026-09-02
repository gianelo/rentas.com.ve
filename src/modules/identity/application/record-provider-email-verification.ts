import {
  decideProviderEmailVerification,
  type ProviderSignIn,
} from "../domain/provider-email-verification";
import type { AccountEmailVerificationPort } from "./ports/account-email-verification.port";

/**
 * tasks.md 19.14 — «escribir la fecha en el camino de Google cuando
 * `toMinimalGoogleProfile` ya confirmó que Google la verificó».
 *
 * Dos líneas de orquestación y ninguna regla: preguntarle al dominio —con el
 * reloj— y escribir sólo cuando contestó. La decisión de qué proveedor cuenta
 * y sobre qué dirección vive en `provider-email-verification.ts`, con el piso
 * del 90 % encima; acá no hay ni un `if` de producto.
 */
export interface RecordProviderEmailVerificationDependencies {
  readonly accounts: AccountEmailVerificationPort;
  /**
   * El reloj, obligatorio por la misma razón que en
   * `resolveContactVerification`: el instante que se escribe es el que la
   * ventana de doce meses de la 19.11 va a juzgar después, y un valor por
   * omisión dejaría que un llamador lo perdiera en silencio.
   */
  readonly now: () => Date;
}

export async function recordProviderEmailVerification(
  signIn: ProviderSignIn,
  dependencies: RecordProviderEmailVerificationDependencies,
): Promise<void> {
  const decision = decideProviderEmailVerification(signIn, dependencies.now());
  if (!decision) return;

  // **Un fallo acá no cierra la puerta.** Registrar la evidencia es un hecho
  // de la cuenta, no una condición para entrar: sin fecha, la 19.10 vuelve a
  // cerrar en falso —no verifica, no escribe fila, la ficha no dibuja nada—,
  // que es la dirección segura (AGENTS.md §7). Dejar propagar el error
  // convertiría «no se pudo anotar» en «no podés entrar», y además dejaría al
  // visitante afuera con la sesión ya creada en la base: `events.signIn` de
  // `@auth/core` corre DESPUÉS de `createSession` y antes de que la respuesta
  // devuelva la cookie.
  try {
    await dependencies.accounts.markEmailVerified(decision);
  } catch (error) {
    console.error("no se pudo registrar el correo verificado del proveedor", error);
  }
}
