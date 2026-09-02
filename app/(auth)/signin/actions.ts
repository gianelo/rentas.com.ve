"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  magicLinkAddressOf,
  magicLinkRequestFor,
  magicLinkTicketOf,
  serialiseMagicLinkTicket,
} from "@/modules/identity/domain/magic-link-request";
import {
  SIGN_IN_WAIT_PATH,
  safeSignInReturn,
} from "@/modules/identity/domain/safe-return-destination";
import { signInPathFor } from "@/modules/identity/domain/sign-in-page";
import { signIn } from "@/modules/identity/infrastructure/auth";
import type { PendingMagicLinkDatabase } from "@/modules/identity/infrastructure/drizzle-pending-magic-link";
import { sealTicket, TICKET_COOKIE, TICKET_COOKIE_OPTIONS } from "./enlace";

/**
 * Pedir el enlace por correo (22.22, láminas 8a/9a) y volver a pedirlo (15.9).
 *
 * **Una sola acción para los dos formularios**, porque son el mismo hecho: sale
 * un correo hacia una dirección. Dos acciones serían dos lugares donde la
 * ventana puede quedarse vieja.
 *
 * **Ninguna regla vive acá.** Ordena llamadas: normalizar, leer el comprobante,
 * preguntar, mandar, guardar, redirigir. Server Action y no `route.ts` por lo
 * mismo que el flujo de publicar: un POST nativo funciona con el script
 * apagado, y `page.tsx` y `route.ts` no comparten segmento.
 */

/**
 * Si Auth.js llegó a despachar el correo. Con `redirect: false` la librería
 * **no tira ante un fallo del envío**: devuelve la dirección a la que habría
 * mandado, y ante un error ésa es su pantalla de error y no la de
 * «verify-request». De esa distinción depende si se escribe un comprobante — y
 * uno escrito sobre un correo que no salió hace que la pantalla siguiente diga
 * «Le mandamos un enlace a…» sin que exista tal enlace. La forma de la
 * dirección de éxito la fija `@auth/core` en `sendToken`.
 */
function despachado(destino: string): boolean {
  try {
    return new URL(destino, "https://rentas.invalid").pathname.endsWith("/verify-request");
  } catch {
    return false;
  }
}

/**
 * La huella del enlace que ACABA de salir (15.14), o `null`.
 *
 * **La más nueva es la nuestra**: el puerto devuelve las pendientes de la más
 * nueva a la más vieja, y la que se escribió hace un instante es la de mayor
 * vencimiento. Dos pedidos simultáneos al mismo buzón podrían cruzarse, y el
 * peor caso es que esta pestaña vigile el enlace de la otra — el mismo buzón,
 * la misma persona.
 *
 * **Un fallo acá no puede cerrar la puerta.** El correo ya salió; negarse
 * ahora dejaría a alguien esperando un enlace que existe sin pantalla que se
 * lo diga. Se pierde el sondeo, que es una mejora, y no la espera. Es la misma
 * asimetría que `recordProviderEmailVerification` documenta.
 *
 * **La base entra por importación diferida y no arriba**, igual que
 * `readAuthMailerConfig` pospone su configuración: `client.ts` exige
 * `DATABASE_URL` al cargarse, y arriba lo exigiría también la pantalla de
 * espera —que importa este módulo por sus formularios— sin necesitarlo para
 * nada.
 */
async function huellaDelEnlace(address: string): Promise<string | null> {
  try {
    const [{ DrizzlePendingMagicLinks }, { db }] = await Promise.all([
      import("@/modules/identity/infrastructure/drizzle-pending-magic-link"),
      import("@/shared/db/client"),
    ]);
    const pendientes = await new DrizzlePendingMagicLinks(
      db as unknown as PendingMagicLinkDatabase,
    ).findPendingFingerprints({ identifier: address, now: new Date() });

    return pendientes[0] ?? null;
  } catch {
    return null;
  }
}

export async function requestMagicLink(formData: FormData): Promise<void> {
  const store = await cookies();
  const address = magicLinkAddressOf(formData.get("correo"));
  const returnTo = safeSignInReturn(String(formData.get("callbackUrl") ?? ""));
  const ticket = magicLinkTicketOf(store.get(TICKET_COOKIE)?.value);
  const decision = magicLinkRequestFor({ address, ticket, nowMs: Date.now() });

  if (!decision.send) {
    // Negarse por la ventana devuelve a la espera, que es donde la cuenta
    // regresiva está dibujada; negarse por la dirección devuelve a la puerta,
    // que es donde está el campo. En los dos casos no salió ningún correo.
    redirect(decision.reason === "muy-pronto" ? SIGN_IN_WAIT_PATH : signInPathFor(returnTo));
  }

  // `redirect: false` para poder mirar el resultado antes de escribir nada. Con
  // el redirect de la librería, el comprobante tendría que escribirse ANTES del
  // envío y quedaría prometiendo un correo que pudo no salir.
  const destino = (await signIn("email", {
    email: decision.address,
    // `null` es «sin destino», y ahí la vuelta es al inicio: es lo que hace
    // Auth.js sin `callbackUrl`, dicho explícito. Del otro lado del viaje
    // `callbacks.redirect` lo vuelve a juzgar con `safeSignInReturn` (15.10).
    redirectTo: returnTo ?? "/",
    redirect: false,
  })) as string;

  if (!despachado(destino)) redirect(signInPathFor(returnTo));

  store.set(
    TICKET_COOKIE,
    serialiseMagicLinkTicket(
      sealTicket({
        address: decision.address,
        sentAtMs: Date.now(),
        returnTo,
        linkFingerprint: await huellaDelEnlace(decision.address),
      }),
    ),
    TICKET_COOKIE_OPTIONS,
  );
  redirect(SIGN_IN_WAIT_PATH);
}
