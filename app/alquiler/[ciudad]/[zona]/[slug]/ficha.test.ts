import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIR = "app/alquiler/[ciudad]/[zona]/[slug]";
const css = readFileSync(`${DIR}/ficha.module.css`, "utf-8");
const page = readFileSync(`${DIR}/page.tsx`, "utf-8");

/** El valor de `order` de una regla, para leer el orden del móvil. */
function order(selector: string): number {
  const match = css.match(new RegExp(`\\.${selector}\\s*\\{[^}]*order:\\s*(\\d+)`));
  if (!match) throw new Error(`.${selector} no declara order`);
  return Number(match[1]);
}

describe("la ficha en una columna", () => {
  /**
   * **El precio pesa más que el título, en orden de documento y en peso
   * visual** (regla transversal 2), y en escritorio vive en la columna
   * derecha. Las dos cosas a la vez sólo se sostienen si el móvil ordena sus
   * propios bloques: concatenar "toda la izquierda, después toda la derecha"
   * dejaría el precio debajo de la descripción, que es la cifra que se escanea
   * escondida detrás del párrafo que casi nadie lee entero.
   *
   * Y el contacto va al final, después de la descripción: la ficha existe para
   * decidir si vale escribirle a quien publica, y ese botón llega cuando la
   * decisión ya se tomó.
   */
  it("pone el precio pegado a la foto y el contacto al final", () => {
    expect(order("gallery")).toBeLessThan(order("summary"));
    expect(order("summary")).toBeLessThan(order("body"));
    expect(order("body")).toBeLessThan(order("contact"));
  });

  /** Un solo punto de quiebre, y es el del proyecto. */
  it("declara un único punto de quiebre, el del proyecto", () => {
    const queries = [...css.matchAll(/@media([^{]+)\{/g)].map((match) => match[1]?.trim());

    expect(queries.length).toBeGreaterThan(0);
    expect(new Set(queries)).toEqual(new Set(["(min-width: 768px)"]));
  });

  /** Regla transversal: el texto tenue es `--soft`, nunca una opacidad. */
  it("no atenúa nada con opacity", () => {
    expect(css).not.toMatch(/opacity/);
  });

  /**
   * El ancho lo pone `Container`, que se planta en 1100px: de ahí en adelante
   * lo único que crece es el aire de los costados. El `max-width` propio que
   * la ficha traía la dejaba clavada en 360px, que es el ancho de una lámina
   * del diseño y no el de un teléfono.
   */
  it("toma el ancho de Container y no fija uno propio", () => {
    expect(page).toContain("Container");
    expect(css).not.toMatch(/max-width/);
  });

  /** Sin JavaScript de cliente en el camino de lectura (D13). */
  it("no lleva JavaScript de cliente", () => {
    expect(page).not.toContain('"use client"');
  });

  it("compone la galería y las dos columnas en vez de dibujarlas de nuevo", () => {
    expect(page).toContain("PhotoStrip");
    expect(page).toContain("DetailSplit");
  });
});

/**
 * **El enlace del pie tenía destino y no llevaba a ningún lado** (tasks.md
 * 8.7).
 *
 * `href="#reportar"` es un ancla a una sección que esta página nunca dibujó:
 * tocarlo no hacía absolutamente nada. Y como se veía bien, la Fase 8 quedó
 * marcada 6/6 con `reportListing` completo, probado contra Postgres real y sin
 * un solo llamador — el umbral de tres reportantes distintos no podía
 * dispararse nunca.
 *
 * Lo que se afirma no es el texto del `href` sino que **lo que nombra existe
 * como ruta**. Una comparación de cadenas seguiría en verde con la ruta mal
 * escrita; esto no.
 */
describe("el enlace de reportar del pie (F31)", () => {
  const bloque = /styles\.report[\s\S]*?<\/AppLink>/.exec(page)?.[0];

  it("la guarda: el enlace sigue estando en la ficha", () => {
    // Sin esto, un enlace renombrado dejaría a este bloque midiendo `undefined`
    // y pasando por eso — la peor forma de verde.
    expect(bloque).toBeDefined();
    expect(bloque).toContain("Reportar este aviso");
  });

  it("no es un ancla de la misma página", () => {
    expect(bloque).not.toMatch(/href="#/);
  });

  it("lleva a una ruta que existe de verdad", () => {
    const destino = /href=\{`\$\{listingPath\}(\/[a-z-]+)`\}/.exec(bloque ?? "")?.[1];

    expect(destino).toBe("/reportar");
    expect(existsSync(`${DIR}${destino}/page.tsx`)).toBe(true);
  });
});
