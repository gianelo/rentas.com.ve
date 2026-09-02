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

  // **Sin `try` propio, y es una decisión medida y no un olvido.** Un fallo
  // acá no puede cerrar la puerta: registrar la evidencia es un hecho de la
  // cuenta, no una condición para entrar, y sin fecha la 19.10 vuelve a
  // cerrar en falso —no verifica, no escribe fila, la ficha no dibuja nada—,
  // que es la dirección segura (AGENTS.md §7). Eso ya lo garantiza
  // `@auth/core` 0.41.3, que envuelve TODOS los eventos en su propio
  // `try`/`catch` (`lib/init.js:138`, `eventsErrorHandler`) y sigue
  // devolviendo la cookie de sesión. Un segundo `catch` acá no agregaría una
  // garantía: taparía la de la librería, y el día que la librería la quitara
  // nada avisaría. Lo que avisa es la prueba que conduce esa vuelta con la
  // escritura rota, en `emailverified-de-auth-js.test.ts`.
  await dependencies.accounts.markEmailVerified(decision);
}
