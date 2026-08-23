import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchBar } from "./SearchBar";

const barCss = readFileSync("components/molecules/SearchBar.module.css", "utf-8");
const barSource = readFileSync("components/molecules/SearchBar.tsx", "utf-8");

function block(css: string, selector: string): string {
  const match = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`falta el bloque .${selector}`);
  return match[1] ?? "";
}

const FORM = {
  label: "¿En qué zona buscás?",
  action: "/",
  name: "q",
  value: "",
  submitLabel: "Buscar",
};

describe("SearchBar — la caja del inicio", () => {
  it("dibuja el texto que le dan, sin escribir uno propio", () => {
    const html = renderToStaticMarkup(<SearchBar {...FORM} />);

    expect(html).toContain("¿En qué zona buscás?");
    // El texto llega del dominio: escribirlo acá sería una segunda copia que
    // se separaría de la primera en cuanto alguien corrigiera una.
    expect(barSource).not.toContain("En qué zona");
  });

  /**
   * **El mecanismo entero, y la razón de que sea un formulario y no un enlace.**
   *
   * F14: sin JavaScript esto tiene que funcionar igual. Un `<form method="get">`
   * lo hace el navegador solo — se escribe, se envía, el servidor traduce y
   * redirige. Sugerir mientras se escribe es una mejora ENCIMA de esto.
   */
  it("es un GET que vuelve al servidor, no un enlace", () => {
    const html = renderToStaticMarkup(<SearchBar {...FORM} />);

    expect(html).toContain('method="get"');
    expect(html).toContain('action="/"');
    expect(html).toContain('name="q"');
    expect(html).toContain("<button");
  });

  /**
   * **Una etiqueta de verdad, no un `placeholder`.** El `placeholder`
   * desaparece en cuanto se escribe una letra, y los lectores de pantalla, el
   * modo de contraste forzado y el autocompletado del navegador se apoyan en la
   * asociación `for`/`id`, nunca en él.
   */
  it("asocia una etiqueta real con el campo", () => {
    const html = renderToStaticMarkup(<SearchBar {...FORM} />);
    const forAttribute = html.match(/<label[^>]*for="([^"]+)"/)?.[1];

    expect(forAttribute).toBeDefined();
    expect(html).toContain(`id="${forAttribute}"`);
  });

  it("devuelve lo escrito para que el campo no se vacíe al volver del servidor", () => {
    const html = renderToStaticMarkup(<SearchBar {...FORM} value="altamira" />);

    expect(html).toContain('value="altamira"');
  });

  /**
   * `<search>` y no `role="search"`: es el elemento de referencia real, y un rol
   * pegado a mano es una promesa que el marcado ya cumple.
   */
  it("se anuncia como la búsqueda de la página", () => {
    expect(renderToStaticMarkup(<SearchBar {...FORM} />)).toContain("<search>");
  });

  /**
   * El glifo `◎` de la lámina es decoración: el nombre accesible del campo ya
   * lo da su etiqueta, y anunciar un círculo no le agrega nada a quien no lo ve.
   */
  it("marca el glifo como decorativo", () => {
    expect(renderToStaticMarkup(<SearchBar {...FORM} />)).toMatch(/aria-hidden="true"/);
  });

  /** El camino de lectura no tiene runtime (D13), y esto lo mantiene así. */
  it("no declara JavaScript de cliente", () => {
    expect(barSource).not.toContain("use client");
    // Un `onChange`/`onSubmit` volvería el mecanismo dependiente del script.
    expect(barSource).not.toMatch(/on(Change|Submit|Input|Click)=/);
  });

  it("tiene foco visible, como todo control del sistema", () => {
    const rule = barCss.match(/\.bar:focus-within\s*\{([^}]*)\}/);
    const outline = rule?.[1]?.match(/outline:\s*([^;]+);/)?.[1]?.trim();

    expect(outline).toBeDefined();
    expect(outline).not.toBe("none");
  });

  it("es una píldora con su propio alto, que alcanza el objetivo táctil mínimo", () => {
    // La lámina la dibuja redondeada del todo y alta: es el control más grande
    // de la pantalla y el primero que un pulgar busca. El alto es una decisión
    // de esta pieza y tiene token propio — apuntaba a `--target-min` sólo
    // porque el conjunto no nombraba los 50 px dibujados. Que 50 ≥ 44 lo
    // comprueba `design-contract.test.tsx` contra `tokens.css`, no acá.
    expect(block(barCss, "bar")).toContain("border-radius: var(--rs)");
    expect(block(barCss, "bar")).toContain("min-block-size: var(--searchbar-h)");
  });
});
