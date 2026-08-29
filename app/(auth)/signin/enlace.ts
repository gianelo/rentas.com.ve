import { MAGIC_LINK_MAX_AGE_SECONDS } from "@/modules/identity/domain/magic-link";

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
