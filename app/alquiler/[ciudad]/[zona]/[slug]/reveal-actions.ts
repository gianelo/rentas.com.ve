"use server";

import { redirect } from "next/navigation";
import {
  ListingNotRevealableError,
  revealContact,
} from "@/modules/contact-reveal/application/reveal-contact";
import {
  DrizzleContactRevealEvents,
  DrizzleRevealableListing,
} from "@/modules/contact-reveal/infrastructure/drizzle-contact-reveal";
import { UnauthenticatedError } from "@/modules/identity/application/require-authenticated-session";
import { safeSignInDestination } from "@/modules/identity/domain/safe-return-destination";
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
  const signInHref = String(formData.get("signInHref") ?? "");

  try {
    await revealContact(
      { listingId },
      {
        sessionPort: nextAuthSessionPort,
        listings: new DrizzleRevealableListing(db),
        events: new DrizzleContactRevealEvents(db),
      },
    );
  } catch (error) {
    // El punto de fuga principal del producto: quien no tiene cuenta va a
    // entrar y **vuelve a esta misma ficha**, no a la raíz.
    if (error instanceof UnauthenticatedError) {
      // A dónde se puede mandar a alguien lo decide el dominio. Este campo lo
      // manda el navegador, así que es entrada de quien envía: sin esa regla
      // la acción es un redirector abierto, y lo caro es que el enlace se ve
      // nuestro.
      redirect(safeSignInDestination(signInHref));
    }

    // El aviso venció, lo ocultó la moderación o nunca existió. No es un
    // error que valga una pantalla rota: al volver, la ficha se dibuja de
    // nuevo y dice ella misma qué pasó — el estado vencido, o un 404.
    if (error instanceof ListingNotRevealableError) return;

    throw error;
  }
}
