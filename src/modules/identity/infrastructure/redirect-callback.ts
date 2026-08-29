import { safeSignInReturn } from "../domain/safe-return-destination";

/**
 * El único paso por donde cruza «a dónde va alguien después de entrar»
 * (tasks.md 15.10, F19).
 *
 * **Va en `callbacks.redirect` y no en la pantalla de entrar**, y ahí está la
 * diferencia: Auth.js resuelve el `callbackUrl` acá para *las dos puertas* y en
 * *los dos momentos* — cuando se pide el enlace y cuando el enlace se toca, que
 * puede ser en otro aparato. Escrita en la pantalla, la regla se saltearía justo
 * el viaje por el correo, que es donde el destino viaja solo.
 *
 * Acá no se decide nada: `safeSignInReturn` dice qué destino vale.
 */
export function signInRedirect({ url, baseUrl }: { url: string; baseUrl: string }): string {
  const destino = safeSignInReturn(rutaPropia(url, baseUrl));

  return destino === null ? baseUrl : `${baseUrl}${destino}`;
}

/**
 * La dirección llega absoluta o relativa según el momento. Esto la vuelve una
 * ruta nuestra, o la cadena vacía —que el dominio ya rechaza—. Es traducción,
 * no comprobación; se comparan orígenes y no prefijos de texto para que
 * `https://rentas.com.ve.evil.test/…` no pase por empezar igual que el nuestro.
 */
function rutaPropia(url: string, baseUrl: string): string {
  try {
    const destino = new URL(url, baseUrl);
    if (destino.origin !== new URL(baseUrl).origin) return "";

    return `${destino.pathname}${destino.search}`;
  } catch {
    return "";
  }
}
