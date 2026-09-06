/**
 * La tarjeta que se ve cuando alguien pega un enlace del sitio (tarea 26.12).
 *
 * **Vive acá y no en `app/opengraph-image.tsx` por la restricción del medio.**
 * `next/og` dibuja fuera de un navegador: no hay hoja de estilos, no hay
 * cascada y `var(--bg)` no resuelve a nada. La tarjeta *tiene* que recibir
 * valores literales, y la pregunta pasa a ser dónde se escriben esos valores
 * de forma que algo los vigile. `scripts/lint-tokens.mjs` no puede hacerlo —su
 * propia cabecera dice que las declaraciones escritas como objeto de
 * JavaScript quedan fuera de su alcance—, así que el vigilante es
 * `social-card.test.ts`, que compara cada color de acá contra el bloque
 * `[data-theme="menta"]` de `src/styles/tokens.css`. Retocar la paleta pone la
 * prueba en rojo, que es exactamente lo que el gate haría si pudiera leerlo.
 *
 * Es además dónde AGENTS.md §2 lo pide: *no inventes una pantalla, derivala*.
 * Una tarjeta social con colores propios sería la única superficie del
 * producto pintada fuera del sistema.
 */

/** 1200×630 — lo que recortan Facebook, WhatsApp y X sin re-encuadrar. */
export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 } as const;

/**
 * El subconjunto de `menta` que la tarjeta usa, con los nombres del sistema.
 *
 * **Se copian los valores, no se renombran los colores.** `accentInk` es
 * `--accent-ink` en camello porque es la clave de un objeto de JavaScript;
 * `--acc-ink` sería la otra grafía del mismo color, y el gate de tokens
 * rechaza esa por escrito (16.22).
 */
export const SOCIAL_CARD_PALETTE = {
  bg: "#f0f5f9",
  surface: "#ffffff",
  line: "#e1e4e6",
  ink: "#1e2022",
  soft: "#52616b",
  accent: "#272343",
  accentInk: "#ffffff",
  tint: "#e3f6f5",
} as const;

/**
 * Lo que la tarjeta dice.
 *
 * **La marca es la palabra, y no hay logotipo.** SISTEMA.md, «Assets»: *no hay
 * logotipo: la marca es la palabra "Rentoru" en el stack del sistema — con
 * mayúscula inicial y sin punto final*. La tarjeta es la superficie donde más
 * tienta dibujar un símbolo, y la respuesta del sistema es que no existe.
 *
 * La bajada dice lo que el producto hace y **no promete nada que no haga**: no
 * hay comisión, no hay contrato y la plataforma no toca dinero (AGENTS.md).
 */
export const SOCIAL_CARD = {
  mark: "Rentoru",
  tagline: "Alquiler de larga estancia en Venezuela. Publicar y buscar es gratis, sin comisión.",
  /** Lo que lee un lector de pantalla cuando la tarjeta llega por mensaje. */
  alt: "Rentoru — alquiler de larga estancia en Venezuela, gratis y sin comisión.",
} as const;

/**
 * **Las áreas que el producto cubre, derivadas y no transcritas.**
 *
 * La primera versión de esta tarjeta decía «Distrito Capital · Maracaibo»
 * escrito a mano, y las dos palabras estaban mal el día que se escribieron: la
 * 17.2 renombró esa área a «Caracas» porque «Distrito Capital» es
 * factualmente incorrecto para cinco de las seis zonas que agrupaba, y el
 * 2026-09-06 esa ciudad dejó de existir en producción cuando la 17.15 sembró
 * la taxonomía real. Una tarjeta social no tiene modo de error —nadie la ve
 * romperse, sólo la comparte— así que un nombre viejo ahí sobrevive años.
 *
 * Sale de `AREAS`, el arreglo de producto que define la agrupación y que la
 * siembra usa, así que agregar un área la pone en la tarjeta sin que nadie se
 * acuerde de esta línea.
 */
export function socialCardAreas(areaNames: readonly string[]): string {
  return [...areaNames].join(" · ");
}
