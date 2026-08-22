import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DetailSplit } from "./DetailSplit";

const css = readFileSync("components/layout/DetailSplit.module.css", "utf-8");
const BREAKPOINT = "@media (min-width: 768px)";
const mobile = css.slice(0, css.indexOf(BREAKPOINT));
const desktop = css.slice(css.indexOf(BREAKPOINT));

/** El bloque de una regla, admitiendo que el selector venga agrupado. */
function rule(css: string, selector: string): string {
  const match = css.match(new RegExp(`\\.${selector}[^{]*\\{([^}]*)\\}`));
  if (!match) throw new Error(`missing .${selector} rule`);
  return match[1] ?? "";
}

describe("DetailSplit", () => {
  it("renders both the media slot and the data slot", () => {
    const markup = renderToStaticMarkup(
      <DetailSplit media={<figure>photo</figure>} data={<aside>price</aside>} />,
    );

    expect(markup).toContain("<figure>photo</figure>");
    expect(markup).toContain("<aside>price</aside>");
  });

  /**
   * **Debajo del punto de quiebre las dos columnas no existen, y eso tiene que
   * ser cierto en el árbol y no sólo a la vista.** Una ficha en una columna no
   * lleva el mismo orden que en dos: el precio va pegado a la foto, y la
   * descripción entre los datos y el contacto. Si los envoltorios siguieran
   * siendo cajas, el móvil quedaría atado a "primero toda la izquierda,
   * después toda la derecha" — que entierra el precio debajo de la
   * descripción. Con `display: contents` los bloques de la página pasan a ser
   * los ítems de la grilla y la página ordena los suyos, que es donde ese
   * orden se decide.
   */
  it("disuelve las dos columnas en móvil para que la página ordene sus bloques", () => {
    expect(rule(mobile, "media")).toMatch(/display:\s*contents/);
    expect(rule(mobile, "data")).toMatch(/display:\s*contents/);
  });

  it("arma las dos columnas y pega la derecha sólo a partir del punto de quiebre", () => {
    expect(desktop).toMatch(/grid-template-columns:\s*640px 420px/);
    expect(desktop).toMatch(/\.data\s*\{[^}]*position:\s*sticky/);
    // Y en móvil no se pega nada: una columna pegada dentro de una sola
    // columna se queda flotando sobre el resto de la ficha.
    expect(mobile).not.toMatch(/position:\s*sticky/);
  });

  /** Un único punto de quiebre, y es el del proyecto. */
  it("declara un solo punto de quiebre", () => {
    const queries = [...css.matchAll(/@media([^{]+)\{/g)].map((match) => match[1]?.trim());

    expect(new Set(queries)).toEqual(new Set(["(min-width: 768px)"]));
  });
});
