import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListingMeta } from "./ListingMeta";

const metaCss = readFileSync("components/atoms/ListingMeta.module.css", "utf-8");

/**
 * **Aserciones mudadas de sujeto a propósito, y sólo porque el sujeto se
 * mudó.** Las dos primeras vivían en `ListingCard.test.tsx` sobre
 * `ListingCard.module.css`; ese bloque ya no existe porque el papel
 * tipográfico se promovió acá. No es reapuntar una aserción a otra cosa —lo
 * que la 14.42 prohíbe—: es la misma afirmación sobre el mismo CSS, que ahora
 * vive en un solo archivo en vez de tres.
 *
 * Lo que **se dibuja** lo mide `tests/measure/layout.spec.ts` (22.3) en un
 * navegador de verdad, comparando la tarjeta contra `/mis-avisos`.
 */
describe("ListingMeta", () => {
  it("escribe la frase que le dan, sin recomponerla", () => {
    // Quién arma el texto es de cada superficie: `/mis-avisos` le agrega
    // `· ref. LC-0912`, que la lámina 14d dibuja y la cuadrícula no tiene.
    expect(renderToStaticMarkup(<ListingMeta>Chacao · 2 hab · 78 m²</ListingMeta>)).toContain(
      "Chacao · 2 hab · 78 m²",
    );
  });

  it("es un párrafo y no un div: es una línea de texto, no una caja", () => {
    expect(renderToStaticMarkup(<ListingMeta>Chacao</ListingMeta>).startsWith("<p")).toBe(true);
  });

  it("no atenúa texto con opacity — el gris es --soft", () => {
    // Regla transversal 3: `opacity` atenúa también el borde y el fondo, y
    // deja el contraste fuera de control.
    expect(metaCss).not.toMatch(/opacity\s*:/);
    expect(metaCss).toContain("color: var(--soft)");
  });

  it("lee la escala de metadato del sistema y no una propia", () => {
    expect(metaCss).toContain("font-size: var(--meta-fs)");
    expect(metaCss).toContain("font-weight: var(--meta-fw)");
  });
});
