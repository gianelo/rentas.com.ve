import { normaliseEmail } from "./contact-verification";

/**
 * tasks.md 19.14 — **cuándo la entrada por un proveedor deja evidencia de que
 * el correo de la cuenta está verificado, y con qué instante.**
 *
 * La 19.10 da por verificado el correo propio con el instante que Auth.js
 * dejó al entrar. Por el enlace mágico ese instante existe; por Google no:
 * `@auth/core` 0.41.3 crea la cuenta de OAuth con `emailVerified: null`
 * escrito a mano (`lib/actions/callback/handle-login.js:260`), sea cual sea lo
 * que devuelva `profile()`, mientras las líneas 70 y 76 sí escriben la fecha
 * en las dos ramas del enlace. Auth.js no distingue entre un proveedor OAuth
 * que verifica y uno que miente, así que trata a todos como si mintieran — y
 * el resultado es que el camino que verifica MEJOR es el único sin fecha.
 *
 * **El instante es AHORA, y no es una fecha inventada.** Lo que se registra
 * no es «cuándo se verificó el correo alguna vez» sino cuándo el proveedor lo
 * AFIRMÓ, que es en esta entrada. Es exactamente lo que hace el enlace mágico
 * al canjearse (`emailVerified: new Date()`), y es lo que la ventana de doce
 * meses de la 19.11 puede juzgar con honestidad. Las cuentas de Google que ya
 * existen no se rellenan hacia atrás —nadie sabe cuándo se verificaron—: la
 * suya la escriben la próxima vez que entren, con la afirmación de ese día.
 *
 * Sin I/O y sin reloj propio: `now` entra como parámetro, la misma forma de
 * `decideContactVerification` en este módulo.
 */

/**
 * **Los proveedores de los que se sabe que verifican el correo, por nombre.**
 *
 * Una lista y no «cualquier OAuth», porque la afirmación es lo único que
 * distingue esto de inventar un instante: `toMinimalGoogleProfile` ya rechaza
 * un correo que Google no verificó, así que de Google se sabe. Del segundo
 * proveedor que se agregue no se sabrá nada hasta que alguien lo compruebe, y
 * hasta entonces no escribe fecha (AGENTS.md §7).
 */
export const PROVEEDORES_QUE_VERIFICAN_EL_CORREO: readonly string[] = ["google"];

export interface ProviderSignIn {
  /** `user.id` de la fila que quedó en la base. */
  readonly userId: string;
  /** `account.provider` — `"google"` para la puerta de Google. */
  readonly providerId: string;
  /**
   * El perfil CRUDO del proveedor, no el que `profile()` recortó: es el único
   * sitio donde sigue viva la afirmación `email_verified`. Falta en la puerta
   * del enlace por correo, que no lo lleva ni lo necesita.
   */
  readonly profile?: Record<string, unknown> | null;
  /** `user.email` de la fila, que es sobre la que se escribiría la fecha. */
  readonly accountEmail?: string | null;
}

export interface AccountEmailVerified {
  readonly userId: string;
  readonly verifiedAt: Date;
}

/**
 * La afirmación del proveedor, leída en un solo sitio para que no se
 * bifurque: `toMinimalGoogleProfile` decide con esto a quién deja entrar y
 * esta regla decide con esto qué se registra. Que fueran dos lecturas
 * distintas sería admitir a alguien por verificado y negarle la fecha.
 *
 * La ausencia de la afirmación no es un sí.
 */
export function providerClaimsVerifiedEmail(
  profile: Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(profile?.email_verified);
}

export function decideProviderEmailVerification(
  signIn: ProviderSignIn,
  now: Date,
): AccountEmailVerified | null {
  if (!PROVEEDORES_QUE_VERIFICAN_EL_CORREO.includes(signIn.providerId)) return null;
  if (!providerClaimsVerifiedEmail(signIn.profile)) return null;

  // **La cuenta que vuelve trae su correo GUARDADO, no el del perfil**:
  // `handle-login.js` devuelve `userByAccount` tal cual, sin refrescarlo. Si
  // alguien cambió su dirección en Google, la fila lleva la vieja y la
  // afirmación es sobre la nueva; escribir la fecha ahí afirmaría de una
  // dirección algo que nadie dijo de ella.
  const afirmado = normaliseEmail(String(signIn.profile?.email ?? ""));
  const enLaFila = normaliseEmail(signIn.accountEmail ?? "");
  if (afirmado === "" || afirmado !== enLaFila) return null;

  return { userId: signIn.userId, verifiedAt: now };
}
