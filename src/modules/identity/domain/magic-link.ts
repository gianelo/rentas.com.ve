/**
 * El segundo tímido para entrar (tasks.md 15.3–15.5, F17), puro y sin I/O.
 *
 * **`MAGIC_LINK_MAX_AGE_SECONDS` está acá y no repetido en `auth.ts`.** El
 * default de la librería es un día entero; quien lo lee en la configuración
 * del proveedor no puede saber si `900` es la regla o un valor que alguien
 * puso de paso. Una sola constante, con la regla escrita al lado — la misma
 * idea que `LISTING_LIFETIME_DAYS` en `listing-lifecycle/domain/expiry.ts`.
 */

/** F17: el enlace vale 15 minutos. El default de Auth.js es 24 horas. */
export const MAGIC_LINK_MAX_AGE_SECONDS = 15 * 60;

export interface MagicLinkEmail {
  readonly subject: string;
  readonly body: string;
}

/**
 * Lo que dice el correo. Nada de HTML acá — igual que `composeNotice` en
 * listing-lifecycle, la redacción es del dominio y la presentación es del
 * adaptador (`resend-mailer.ts`).
 */
export function composeMagicLinkEmail(url: string): MagicLinkEmail {
  return {
    subject: "Tu enlace para entrar a Rentas",
    body:
      `Entrá con este enlace:\n${url}\n\n` +
      "Vale por 15 minutos y se puede usar una sola vez. " +
      "Si no lo pediste vos, ignorá este correo.",
  };
}

/**
 * **Espejo deliberado de la comparación que hace `@auth/core`** en
 * `lib/actions/callback/index.js`: `invite.expires.valueOf() < Date.now()`.
 * Mismo sentido que `isExpired` en `listing-lifecycle/domain/expiry.ts`:
 * estrictamente después es lo único que vence — en el instante exacto el
 * enlace todavía vale.
 *
 * No sustituye la comprobación de Auth.js — Auth.js hace la suya sobre la
 * fila que la propia librería borra al usarla (15.4). Esto existe para poder
 * afirmar la frontera en un test puro y rápido, y para probarla de nuevo
 * contra un valor `expires` que sí vino de Postgres (ver
 * `tests/integration/verification-token.test.ts`).
 */
export function isVerificationLinkExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() > expiresAt.getTime();
}
