"use server";

import { redirect } from "next/navigation";
import {
  ListingNotRevealableError,
  RevealRateLimitExceededError,
  revealContact,
} from "@/modules/contact-reveal/application/reveal-contact";
import { MissingRevealMessageError } from "@/modules/contact-reveal/domain/reveal-message";
import {
  DrizzleContactRevealEvents,
  DrizzleRevealableListing,
} from "@/modules/contact-reveal/infrastructure/drizzle-contact-reveal";
import { UnauthenticatedError } from "@/modules/identity/application/require-authenticated-session";
import {
  SIGN_IN_FALLBACK,
  safeReturnPath,
} from "@/modules/identity/domain/safe-return-destination";
import { signIn } from "@/modules/identity/infrastructure/auth";
import { nextAuthSessionPort } from "@/modules/identity/infrastructure/session-port";
import { db } from "@/shared/db/client";

/**
 * Revelar el contacto de un aviso (F19, F29) — la acción que le faltaba al
 * producto para hacer lo que promete.
 *
 * Una acción de servidor y no un enlace, por dos razones que se sostienen
 * juntas: un enlace **no ejecuta nada**, y lo que hay que ejecutar es el
 * registro del evento que la métrica norte cuenta (design.md D6). Y sigue
 * andando sin JavaScript, porque es un POST nativo de un `form`.
 *
 * La sesión se verifica dentro de `revealContact`, antes de tocar el catálogo:
 * una acción de servidor es un endpoint HTTP público como cualquier otro, y el
 * `listingId` que llega acá es lo que mandó quien envía, nunca lo que el
 * servidor cree.
 */
export async function revealListingContact(formData: FormData): Promise<void> {
  const listingId = String(formData.get("listingId") ?? "");
  const doorHref = String(formData.get("doorHref") ?? "");
  const message = String(formData.get("message") ?? "");

  try {
    // Un solo objeto para las dos mitades de la tabla (tasks.md 6.9/6.10):
    // el registro y el límite de cuenta leen la misma fila, así que es una
    // sola conexión y no dos repositorios que se puedan desincronizar.
    const contactRevealEvents = new DrizzleContactRevealEvents(db);

    await revealContact(
      { listingId, message },
      {
        sessionPort: nextAuthSessionPort,
        listings: new DrizzleRevealableListing(db),
        events: contactRevealEvents,
        rateLimit: contactRevealEvents,
      },
    );
  } catch (error) {
    // El punto de fuga principal del producto. **Ya no lo saca del aviso**
    // (tasks.md 15.8): vuelve a ESTA ficha con la puerta abierta, que es un
    // estado de la dirección y por eso se dibuja sin una línea de cliente.
    if (error instanceof UnauthenticatedError) {
      // A dónde se puede mandar a alguien lo decide el dominio. Este campo lo
      // manda el navegador, así que es entrada de quien envía: sin esa regla
      // la acción es un redirector abierto, y lo caro es que el enlace se ve
      // nuestro. `null` obliga a decidir, y la decisión es la pantalla propia.
      redirect(safeReturnPath(doorHref) ?? SIGN_IN_FALLBACK);
    }

    // El aviso venció, lo ocultó la moderación o nunca existió. No es un
    // error que valga una pantalla rota: al volver, la ficha se dibuja de
    // nuevo y dice ella misma qué pasó — el estado vencido, o un 404.
    if (error instanceof ListingNotRevealableError) return;

    // Sin mensaje, o por encima del límite de cuenta (tasks.md 6.9/6.12): en
    // los dos casos no se reveló nada, y una pantalla rota no es la respuesta
    // — el `required` del formulario ya evita el primer caso en el uso
    // normal; esto es el respaldo del servidor.
    if (error instanceof MissingRevealMessageError) return;
    if (error instanceof RevealRateLimitExceededError) return;

    throw error;
  }
}

/**
 * Entrar con Google **desde la puerta de la ficha** (tasks.md 15.8). Una acción
 * y no un enlace a `/signin`: la puerta ya está sobre el aviso, y una pantalla
 * intermedia pone dos pasos donde el diseño dibuja uno. Sin JavaScript es un
 * POST nativo, como el formulario de revelar.
 *
 * **Acá no se valida el destino, a propósito**: lo juzga `safeSignInReturn` en
 * `callbacks.redirect`, el único paso por donde cruzan las dos puertas y los
 * dos momentos del enlace (15.10). Repetirlo sería una segunda regla que algún
 * día discrepa de la única.
 */
export async function continueWithGoogle(formData: FormData): Promise<void> {
  await signIn("google", { redirectTo: String(formData.get("callbackUrl") ?? "") || "/" });
}
