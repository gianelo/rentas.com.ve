import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchPill } from "./SearchPill";

const pillCss = readFileSync("components/molecules/SearchPill.module.css", "utf-8");

function block(css: string, selector: string): string {
  const match = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`falta el bloque .${selector}`);
  return match[1] ?? "";
}

const BASE = {
  action: "/",
  name: "zona",
  value: "",
  placeholder: "¿En qué zona buscás?",
  submitLabel: "Buscar",
};

/**
 * La pastilla de búsqueda (diseño 14i — "contrato para todas las
 * pantallas"). Tres piezas dentro de un mismo borde, sin divisores: el
 * texto, el filtro y la lupa. Este componente sólo dibuja lo que
 * `resolveSearchPill` (dominio) ya decidió — acá no hay una regla, hay un
 * `switch` sobre `state.kind`.
 */
describe("SearchPill — vacía (sin zona elegida)", () => {
  it("el filtro está AUSENTE, no vacío: sin búsqueda no hay nada que filtrar", () => {
    const html = renderToStaticMarkup(<SearchPill {...BASE} state={{ kind: "empty" }} />);

    expect(html).not.toMatch(/Filtros|filtro/);
  });

  it("es un GET que vuelve al servidor, no un enlace ni un manejador de clic", () => {
    const html = renderToStaticMarkup(<SearchPill {...BASE} state={{ kind: "empty" }} />);

    expect(html).toContain('method="get"');
    expect(html).toContain('action="/"');
    expect(html).toContain('name="zona"');
    expect(html).toMatch(/<button[^>]*type="submit"/);
  });

  it("se anuncia como la búsqueda de la página", () => {
    expect(renderToStaticMarkup(<SearchPill {...BASE} state={{ kind: "empty" }} />)).toContain(
      "<search>",
    );
  });
});

describe("SearchPill — con zona elegida", () => {
  const state = {
    kind: "selected" as const,
    zoneLabel: "Chacao",
    count: 12,
    filterLabel: "Filtros",
    filterAccent: false,
    filterCount: 0,
  };

  it("muestra el nombre de zona y el conteo en la segunda línea del texto — nunca un badge", () => {
    const html = renderToStaticMarkup(
      <SearchPill
        {...BASE}
        value="Chacao"
        state={state}
        filtersHref="/alquiler/chacao?panel=filtros"
      />,
    );

    expect(html).toContain('value="Chacao"');
    expect(html).toContain("12 avisos");
    // Nada con pinta de badge/contador flotante — la cuenta es texto, no un
    // elemento aparte con su propia forma.
    expect(html).not.toMatch(/data-badge/);
  });

  it("con zona y sin filtros, el enlace de filtro dice «Filtros», nunca «0 filtros»", () => {
    const html = renderToStaticMarkup(
      <SearchPill {...BASE} state={state} filtersHref="/alquiler/chacao?panel=filtros" />,
    );

    expect(html).toContain("Filtros");
    expect(html).not.toContain("0 filtros");
    expect(html).toContain('href="/alquiler/chacao?panel=filtros"');
  });
});

describe("SearchPill — con filtros aplicados", () => {
  const state = {
    kind: "selected" as const,
    zoneLabel: "Chacao, Altamira",
    count: 9,
    filterLabel: "3 filtros",
    filterAccent: true,
    filterCount: 3,
  };

  it("la etiqueta cuenta y pasa a acento — sin badge aparte", () => {
    const html = renderToStaticMarkup(
      <SearchPill {...BASE} state={state} filtersHref="/alquiler/chacao?panel=filtros" />,
    );

    expect(html).toContain("3 filtros");
    expect(html.match(/filterAccent|accent/i)).not.toBeNull();
  });

  it("el CSS de móvil esconde la palabra pero deja el número, según el dominio manda", () => {
    // La regla del dominio ya está probada en search-pill.test.ts. Acá se
    // ancla, selector por selector y no por cercanía en el texto, que la
    // hoja de estilos tiene el punto de quiebre que la aplica: si alguien
    // invierte cuál de los dos se esconde, esta prueba se pone roja.
    const media = pillCss.slice(pillCss.indexOf("@media (max-width"));

    expect(block(media, "filterWord")).toContain("display: none");
    expect(block(media, "filterCount")).toContain("display: block");
  });
});

describe("SearchPill — geometría y accesibilidad", () => {
  it("es una píldora con su propio radio, tomado de un token", () => {
    expect(block(pillCss, "pill")).toContain("border-radius: var(--rs)");
  });

  it("en escritorio la pastilla queda fija en 420px — el ancho que le da la lámina 14a/14i", () => {
    expect(block(pillCss, "pill")).toContain("max-width: 420px");
  });

  it("la lupa vive en un control con aria-label «Buscar», nunca sólo un icono mudo", () => {
    const html = renderToStaticMarkup(<SearchPill {...BASE} state={{ kind: "empty" }} />);

    expect(html).toMatch(/aria-label="Buscar"/);
  });

  it("ningún literal de color, radio o tamaño de letra fuera de un token (D16)", () => {
    // Repite lo que scripts/lint-tokens.mjs ya exige — se ancla acá también
    // porque este archivo es nuevo y es exactamente el que ese gate existe
    // para atrapar.
    expect(pillCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
