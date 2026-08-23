/**
 * Si una dirección es **otra pantalla de este sitio** o **otra aplicación**.
 *
 * **Existe porque `ActionLink` dibuja las dos cosas.** El mismo átomo sirve
 * «Ver avisos activos en Chacao» —navegación nuestra— y «Escribir por
 * WhatsApp», que es un `wa.me`. Una quiere navegación de cliente; la otra
 * tiene que salir del sitio.
 *
 * **Se resuelve parseando, no comparando el primer carácter.** `//evil.test`
 * empieza con barra y NO es una ruta: el navegador la lee como otro origen
 * sobre el mismo protocolo. Es el mismo caso que `safe-return-destination.ts`
 * ya resuelve, y con el mismo mecanismo — un origen inventado contra el que
 * comparar — para que las dos comprobaciones no se separen con el tiempo.
 *
 * **Nunca lanza.** Corre al dibujar cada enlace de cada pantalla, así que una
 * excepción por un `href` mal armado dejaría la página entera en blanco.
 */

/** No existe y nunca se emite: sólo sirve para tener contra qué comparar. */
const SAME_ORIGIN = "https://navegacion.invalid";

export function isInternalPath(href: string): boolean {
  const value = href.trim();
  // Un ancla mueve el scroll, no navega. Envolverla en el router agrega una
  // entrada al historial para algo que el navegador ya hace mejor solo.
  if (value === "" || value.startsWith("#")) return false;

  let url: URL;
  try {
    url = new URL(value, SAME_ORIGIN);
  } catch {
    return false;
  }

  // Cualquier dirección que traiga su propio origen sale con uno distinto del
  // inventado. Eso cubre `https://`, `//otro-sitio`, `tel:`, `mailto:` y
  // `javascript:` de una vez, sin una lista de esquemas que mantener.
  return url.origin === SAME_ORIGIN;
}
