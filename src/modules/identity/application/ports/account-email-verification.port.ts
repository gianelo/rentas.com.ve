import type { AccountEmailVerified } from "../../domain/provider-email-verification";

/**
 * tasks.md 19.14 — el único lado de `user.emailVerified` que este código
 * escribe.
 *
 * **Narrow a propósito** (AGENTS.md §3): `markEmailVerified` y nada más. Sin
 * `clear`, sin `find` y sin poder tocar otra columna de la cuenta. La lectura
 * ya la hace `ContactVerificationEvidencePort`, que devuelve ese mismo
 * instante junto al resto de la evidencia; un `find` acá sería un segundo
 * sitio donde la misma pregunta queda escrita.
 */
export interface AccountEmailVerificationPort {
  markEmailVerified(verified: AccountEmailVerified): Promise<void>;
}
