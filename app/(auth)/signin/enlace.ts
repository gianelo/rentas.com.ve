import { createHmac, timingSafeEqual } from "node:crypto";
import { MAGIC_LINK_MAX_AGE_SECONDS } from "@/modules/identity/domain/magic-link";
import type { MagicLinkTicket } from "@/modules/identity/domain/magic-link-request";

/**
 * **El comprobante que el navegador guarda mientras espera el enlace** (15.9).
 * Formato y transporte; qué se puede hacer con lo de adentro lo contesta
 * `magic-link-request.ts`. Aparte de `actions.ts` porque un módulo
 * `"use server"` sólo exporta funciones asíncronas — igual que `draft.ts`.
 *
 * **La dirección tecleada NO viaja en la barra.** Con `?correo=` la pantalla se
 * arma sobre cualquier dirección ajena, se pega en un grupo y queda en los
 * registros y en el historial. En una cookie `httpOnly` vuelve al navegador que
 * la escribió y a ningún otro — que es todo lo que la lámina pide. Y deja el
 * camino abierto sin construirlo: el secreto que la 15.14 le exige al sondeo de
 * la 15.12 cabe acá.
 */
export const TICKET_COOKIE = "rentas_enlace";

/**
 * **Muere con el enlace, y el número no se escribe dos veces**: un comprobante
 * que lo sobreviviera dibujaría una espera por algo ya vencido. El alcance es
 * `/signin`, así que ni la búsqueda ni una ficha la ven pasar.
 */
export const TICKET_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/signin",
  maxAge: MAGIC_LINK_MAX_AGE_SECONDS,
  secure: process.env.NODE_ENV === "production",
} as const;

/**
 * **El sello que convierte el comprobante en un secreto del navegador** (15.14).
 *
 * Sin él la cookie es papel: la escribe cualquiera, así que un sondeo que la
 * leyera seguiría contestando sobre la dirección que le pongan — la fuga de
 * presencia entera, mudada de la barra a una cabecera. Con él, sólo el
 * navegador al que le mandamos un enlace tiene un par `(dirección, huella)`
 * que este servidor reconozca.
 *
 * **Cubre la dirección Y la huella juntas.** Sellar sólo la huella dejaría
 * cambiarle la dirección a un comprobante legítimo, que es la misma pregunta
 * ajena con un paso más.
 *
 * **Sin llave no hay sello, y sin sello no hay sondeo** (§7): `AUTH_SECRET`
 * ausente deja la pantalla completa —cuenta regresiva, reenvío y las dos
 * salidas— y calla la mejora, en vez de tumbar la entrada por un aviso.
 */
function sealOf(address: string, fingerprint: string): string | null {
  const key = process.env.AUTH_SECRET;
  if (!key) return null;

  return createHmac("sha256", key).update(`${address}|${fingerprint}`, "utf8").digest("hex");
}

export function sealTicket(ticket: Omit<MagicLinkTicket, "seal">): MagicLinkTicket {
  const fingerprint = ticket.linkFingerprint ?? null;

  return {
    ...ticket,
    seal: fingerprint === null ? null : sealOf(ticket.address, fingerprint),
  };
}

/** Si este servidor emitió ese par. Comparación de tiempo constante. */
export function ticketIsOurs(ticket: MagicLinkTicket): boolean {
  const { address } = ticket;
  const linkFingerprint = ticket.linkFingerprint ?? null;
  const seal = ticket.seal ?? null;
  if (linkFingerprint === null || seal === null) return false;

  const expected = sealOf(address, linkFingerprint);
  if (expected === null || expected.length !== seal.length) return false;

  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(seal, "hex"));
}
