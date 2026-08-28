/**
 * **Si un aviso todavía se puede ofrecer, dicho en un solo lugar** (11.23).
 *
 * La vigencia son DOS condiciones y no una: el estado lo mueve un trabajo
 * programado, y un trabajo programado corre tarde. `vercel.json` agenda
 * `/api/jobs/expiry-reminders` con `0 13 * * *` — una vez al día, a las 13:00
 * UTC—, `markExpired` vive adentro de ese trabajo y nada más mueve el rótulo.
 * Un aviso vence a los 30 días de la HORA en que se publicó, así que entre
 * «vencido por reloj» y «vencido en la base» pasan de 0 a casi 24 horas.
 *
 * Durante esa ventana, mirar sólo el rótulo hace que la misma pantalla se
 * contradiga: el `<head>` pide `noindex` porque `resolveListingIndexing` lee el
 * reloj, mientras el cuerpo dibuja el bloque de contacto con llave y ofrece
 * revelar. Quien llega desde un enlace de WhatsApp gasta una de sus 40
 * revelaciones diarias en un aviso que ya no está — el mensaje desperdiciado
 * que la 5.5 evita del lado de la búsqueda.
 *
 * **Existe como función propia porque son cuatro lugares y tienen que decir lo
 * mismo**: la directiva de indexación, la disponibilidad del documento
 * schema.org, el bloque de contacto de la ficha y el `WHERE` del sitemap
 * (`status = 'active' AND expires_at > now()`, en SQL porque filtra filas).
 * Escrita cuatro veces, las cuatro se separan en el primer arreglo apurado.
 *
 * `now` es un parámetro y no `new Date()`: es lo que mantiene la función pura y
 * su test repetible, la misma razón por la que `buildSitemap` recibe la base.
 */

/**
 * Lo que el ciclo de vida permite hacer con el aviso, en los términos de esta
 * decisión y no en los de `listing.status`.
 *
 * Las mismas dos palabras que `ContactAvailability` declara en el dominio de
 * `contact-reveal`, y a propósito: los dos módulos nombran las uniones sobre
 * las que razonan en vez de importarse entre sí, y el compilador las mantiene
 * idénticas en el único borde que lleva un valor de acá para allá.
 */
export type ListingAvailability = "available" | "expired";

/**
 * Escrito al revés de como se lee — sólo `active` habilita — para que un quinto
 * estado que alguien agregue mañana caiga en la rama que NO ofrece contacto.
 * Ese descuido no falla en ningún lado.
 *
 * El corte es `>` y no `>=`: `expiresAt` es el instante en que el aviso deja de
 * valer, no el último en que vale. Es la misma comparación que
 * `DrizzleSitemap` hace en SQL, y que las dos coincidan es lo que impide
 * ofrecer en la ficha un aviso que el sitemap ya dejó afuera.
 */
export function resolveListingAvailability(
  listing: { readonly status: string; readonly expiresAt: Date },
  now: Date,
): ListingAvailability {
  return listing.status === "active" && listing.expiresAt > now ? "available" : "expired";
}
