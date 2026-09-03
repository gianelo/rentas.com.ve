import { cache } from "react";
import type { AuthenticatedSession } from "@/modules/identity/application/ports/session.port";
import type { NavAccountFlags } from "@/modules/identity/domain/nav-account";
import { DrizzlePublisherHasListings } from "@/modules/listing-publication/infrastructure/drizzle-publisher-has-listings";
import { db } from "@/shared/db/client";

/**
 * **Lo que la barra necesita saber de la cartera, y lo que cuesta** (tasks.md
 * 14.56).
 *
 * `hasListings` no es una columna de `user` como `bulkImportEnabled`: hay que
 * preguntarle a `listing` por publicador, así que en `/`, en las dos pantallas
 * de resultados y en la ficha esto agrega **un viaje donde hoy no había
 * ninguno**. El fundador eligió pagarlo el 2026-09-03 sabiendo el número: lo
 * paga sólo quien tiene sesión, y en esas cuatro pantallas ésa es la minoría
 * porque el inquilino navega anónimo. La alternativa —guardarlo en el token—
 * cambia una mentira fija por una intermitente.
 *
 * **Sin sesión no cuesta nada y ni siquiera se pregunta**: se devuelve
 * `undefined`, que es como `resolveNavAccount` ya recibía las banderas en
 * estas pantallas.
 *
 * **Es un adaptador de entrega, no una regla.** No decide qué dibuja la barra
 * —eso lo sigue decidiendo `resolveNavAccount`—: sólo trae el dato. Memoizado
 * con el mismo `cache` de React y por la misma razón que `readSession`: varias
 * llamadas dentro de una petición, un solo viaje.
 */
const readHasListings = cache((publisherId: string) =>
  new DrizzlePublisherHasListings(db).hasAnyListing(publisherId),
);

export async function readNavAccountFlags(
  session: AuthenticatedSession | null,
): Promise<NavAccountFlags | undefined> {
  if (session === null) return undefined;

  return { hasListings: await readHasListings(session.userId) };
}
