import { cookies } from "next/headers";
import { magicLinkPollFor, magicLinkTicketOf } from "@/modules/identity/domain/magic-link-request";
import {
  DrizzlePendingMagicLinks,
  type PendingMagicLinkDatabase,
} from "@/modules/identity/infrastructure/drizzle-pending-magic-link";
import { db } from "@/shared/db/client";
import { TICKET_COOKIE, ticketIsOurs } from "../../enlace";

/**
 * **El sondeo de la pestaña que espera** (tasks.md 15.12, 15.14).
 *
 * **No recibe nada.** Ni dirección, ni identificador, ni parámetro: lo único
 * que entra es el comprobante `httpOnly` que se dejó al pedir el enlace, y ésa
 * es la tarea entera. Una ruta que aceptara `?correo=` contestaría «¿entró
 * maria.f@gmail.com?» a cualquiera que supiera la dirección, y eso convierte
 * esta pantalla en una forma de saber cuándo alguien está conectado.
 *
 * **El sello es lo que hace que la cookie sea un secreto y no un formulario.**
 * Una cookie la escribe quien envía la petición, así que sin comprobar que el
 * par `(dirección, huella)` salió de acá, mudar la pregunta de la barra a una
 * cabecera no cambia nada. Con el sello, un comprobante armado sobre la
 * dirección de otra persona no recibe respuesta: se va con 204, exactamente lo
 * mismo que recibe quien no tiene comprobante.
 *
 * **Falla cerrado y en silencio** (§7). Sin comprobante, sin sello o sin
 * huella no hay cuerpo que devolver — y la pantalla no depende de esto para
 * nada: la cuenta regresiva, el reenvío y las dos salidas siguen ahí. Se
 * pierde el aviso, nunca la espera.
 *
 * **`no-store` y no un `revalidate`**: la respuesta es distinta por navegador
 * y cambia dentro del mismo minuto; cualquier intermediario que la guardara le
 * daría a alguien el estado de otro.
 */

export const dynamic = "force-dynamic";

/** Una respuesta nueva cada vez: un `Response` de módulo se comparte y su
 * cuerpo se consume una sola vez. */
function sinRespuesta(): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function GET(): Promise<Response> {
  const store = await cookies();
  const ticket = magicLinkTicketOf(store.get(TICKET_COOKIE)?.value);
  if (ticket === null || !ticketIsOurs(ticket)) return sinRespuesta();

  const pendingFingerprints = await new DrizzlePendingMagicLinks(
    db as unknown as PendingMagicLinkDatabase,
  ).findPendingFingerprints({ identifier: ticket.address, now: new Date() });

  const poll = magicLinkPollFor({ ticket, pendingFingerprints });
  if (poll === null) return sinRespuesta();

  return Response.json(poll, { headers: { "cache-control": "no-store" } });
}
