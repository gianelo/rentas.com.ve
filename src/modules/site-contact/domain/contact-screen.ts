/**
 * Qué dibuja y qué dice la pantalla de "Escribinos" (tasks.md 23.7).
 *
 * Mismo mecanismo que `listing-trust/domain/report-screen.ts`, y por la misma
 * razón: sin JavaScript, una Server Action no puede devolver estado a la
 * pantalla que la posteó — sólo puede redirigir. El acuse llega en la URL de
 * la redirección, y esta función es la única que decide qué significa.
 *
 * Vive en el dominio y no en la página, por la regla permanente del fundador
 * (AGENTS.md — "no business rules in the front") y porque el piso de
 * cobertura del 90 % no llega a `app/`.
 */

export const CONTACT_SENT_PARAM = "enviado";
export const CONTACT_ERROR_PARAM = "error";

export interface ContactFormScreen {
  readonly state: "form";
  /**
   * `null` en el caso normal. Presente sólo cuando el servidor rechazó un
   * envío que la validación del navegador (`required`, `type="email"`,
   * `minLength`/`maxLength` en `page.tsx`) debería haber atajado antes —
   * alguien posteando directo, sin pasar por el formulario.
   */
  readonly errorNotice: string | null;
}

export interface ContactSentScreen {
  readonly state: "sent";
}

export type ContactScreen = ContactFormScreen | ContactSentScreen;

const ERROR_NOTICE = "Revisá los datos e intentá de nuevo.";

/**
 * **Presencia y no valor**, igual que `resolveReportScreen`: `?enviado` pelado
 * llega como cadena vacía y repetido llega como arreglo; un `if (flag)`
 * trataría el primero como ausente.
 *
 * El acuse de envío gana sobre el de error cuando los dos llegan juntos —no
 * puede pasar desde esta acción, que redirige a uno o al otro nunca a los
 * dos, pero la función no depende de esa garantía externa para decidir.
 */
export function resolveContactScreen(
  sentFlag: string | readonly string[] | undefined,
  errorFlag: string | readonly string[] | undefined,
): ContactScreen {
  if (sentFlag !== undefined) return { state: "sent" };

  return { state: "form", errorNotice: errorFlag !== undefined ? ERROR_NOTICE : null };
}
