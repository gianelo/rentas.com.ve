import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListingTitle } from "./ListingTitle";

const titleCss = readFileSync("components/atoms/ListingTitle.module.css", "utf-8");
const tokensCss = readFileSync("src/styles/tokens.css", "utf-8");

function tokenValue(name: string): string {
  const match = tokensCss.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`falta el token ${name} en tokens.css`);
  return (match[1] ?? "").trim();
}

describe("ListingTitle — el nivel lo decide el documento", () => {
  /**
   * El nivel no es decoración: en la cuadrícula el título cuelga del `<h1>` de
   * la pantalla de resultados y es un `<h3>`; en `/mis-avisos` cuelga directo
   * del `<h1>` de la página y es un `<h2>`. Un lector de pantalla navega por
   * ese esquema, así que equivocarlo no cambia un pixel y sí cambia cómo se
   * recorre la lista.
   */
  it.each([
    [2, "h2"],
    [3, "h3"],
  ] as const)("con level %i emite un <%s>", (level, tag) => {
    const markup = renderToStaticMarkup(
      <ListingTitle level={level}>Apartamento 2 habitaciones</ListingTitle>,
    );

    expect(markup.startsWith(`<${tag} `)).toBe(true);
    expect(markup).toContain("Apartamento 2 habitaciones");
  });
});

describe("ListingTitle — el recorte es del contenedor", () => {
  /**
   * La cuadrícula recorta a dos líneas porque un título largo empuja los
   * metadatos y desalinea la tarjeta de al lado; la lista apilada de
   * `/mis-avisos` no —la lámina 14c la dibuja sin recortar—. Se comprueba por
   * la clase emitida y no por «contiene dos clases», que seguiría verde si el
   * átomo dejara de distinguirlas.
   */
  it("sin clamp emite una sola clase, la del papel tipográfico", () => {
    const markup = renderToStaticMarkup(<ListingTitle level={2}>Apto en Chacao</ListingTitle>);
    const classes = markup.match(/class="([^"]*)"/)?.[1]?.split(" ") ?? [];

    expect(classes).toHaveLength(1);
  });

  it("con clamp agrega la clase del recorte, sin tocar la del papel", () => {
    const sin =
      renderToStaticMarkup(<ListingTitle level={3}>Apto en Chacao</ListingTitle>).match(
        /class="([^"]*)"/,
      )?.[1] ?? "";
    const con =
      renderToStaticMarkup(
        <ListingTitle level={3} clamp>
          Apto en Chacao
        </ListingTitle>,
      ).match(/class="([^"]*)"/)?.[1] ?? "";

    expect(con.split(" ")).toHaveLength(2);
    expect(con.split(" ")[0]).toBe(sin);
  });

  it("el recorte son dos líneas y vive fuera del bloque de tipografía", () => {
    const papel = titleCss.match(/\.title\s*\{([^}]*)\}/)?.[1] ?? "";
    const recorte = titleCss.match(/\.clamped\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(recorte).toContain("-webkit-line-clamp: 2");
    // Si el recorte volviera al papel, los dos consumidores volverían a
    // discrepar por el camino contrario: `/mis-avisos` recortaría sin pedirlo.
    expect(papel).not.toContain("line-clamp");
  });
});

describe("ListingTitle — es el papel de LISTA, no el de la ficha", () => {
  /**
   * `--card-title-fs` / `--ftw`, nunca `--ficha-title-fs` / `--ficha-title-fw`.
   * Fundir los dos papeles es exactamente cómo el `<h1>` del inicio terminó
   * agarrando `--fpb` —"Precio en ficha"— con `lint:tokens` en verde: ese gate
   * verifica que un valor SEA una propiedad personalizada, nunca que sea la
   * correcta.
   */
  it("lee los tokens del título de lista", () => {
    expect(titleCss).toContain("font-size: var(--card-title-fs)");
    expect(titleCss).toContain("font-weight: var(--ftw)");
  });

  it("no lee ningún token de la ficha", () => {
    expect(titleCss).not.toContain("--ficha-");
  });

  /**
   * Regla transversal 2 desde el otro lado: el título pesa **menos** que el
   * precio, en los dos anchos que las láminas dibujan.
   */
  it("queda por debajo del precio de la tarjeta en los dos anchos", () => {
    const titulo = Number.parseFloat(tokenValue("--card-title-fs"));

    expect(titulo).toBeLessThan(Number.parseFloat(tokenValue("--card-price-fs")));
    expect(titulo).toBeLessThan(Number.parseFloat(tokenValue("--card-price-fs-desktop")));
  });
});
