import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SearchOutcome as SearchOutcomeModel } from "@/modules/listing-search/domain/search-exits";
import { SearchOutcome } from "./SearchOutcome";

/**
 * Lo que se prueba acá es **marcado**, no reglas: qué salidas hay y con qué
 * número lo decide `search-exits.ts`, y ahí está su test. Acá se ata lo que el
 * componente sí puede romper solo — que la salida sea un enlace de verdad y no
 * un botón apagado, y que a mitad de la lista no dibuje nada.
 */
function render(model: SearchOutcomeModel) {
  return renderToStaticMarkup(<SearchOutcome model={model} />);
}

describe("la pantalla del vacío (F11)", () => {
  const EMPTY: SearchOutcomeModel = {
    kind: "empty",
    cause: "Ningún aviso coincide: «3 hab» es el filtro que deja la búsqueda en cero.",
    exits: [
      {
        kind: "drop",
        label: "Quitar las habitaciones y ver 12",
        href: "/alquiler/maracaibo",
        resultCount: 12,
      },
      {
        kind: "widen-price",
        label: "Ampliar a $900 y ver 5",
        href: "/alquiler/maracaibo?max=900",
        resultCount: 5,
      },
    ],
  };

  it("dice cuál es el filtro y ofrece cada salida como un enlace", () => {
    const markup = render(EMPTY);

    expect(markup).toContain("«3 hab» es el filtro que deja la búsqueda en cero");
    expect(markup).toMatch(
      /<a[^>]*href="\/alquiler\/maracaibo"[^>]*>Quitar las habitaciones y ver 12</,
    );
    expect(markup).toMatch(
      /<a[^>]*href="\/alquiler\/maracaibo\?max=900"[^>]*>Ampliar a \$900 y ver 5</,
    );
  });

  it("ninguna salida es un botón apagado", () => {
    const markup = render(EMPTY);

    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("disabled");
  });

  it("sin salidas dice qué pasó igual, en vez de quedarse mudo", () => {
    const markup = render({
      kind: "empty",
      cause: "Todavía no hay avisos publicados en Maracaibo.",
      exits: [],
    });

    expect(markup).toContain("Todavía no hay avisos publicados en Maracaibo.");
    expect(markup).not.toContain("<a");
  });
});

describe("el cierre de la lista (F10)", () => {
  it("dice que están todos y propone el cambio, con su número", () => {
    const markup = render({
      kind: "complete",
      closing: "Son los 9 avisos que coinciden",
      exit: {
        kind: "widen-price",
        label: "Ampliar a $900 y ver 14",
        href: "/alquiler/maracaibo?max=900",
        resultCount: 14,
      },
    });

    expect(markup).toContain("Son los 9 avisos que coinciden");
    expect(markup).toMatch(/<a[^>]*>Ampliar a \$900 y ver 14</);
  });

  it("sin nada que proponer cierra igual, sin un enlace vacío", () => {
    const markup = render({
      kind: "complete",
      closing: "Son los 9 avisos que coinciden",
      exit: null,
    });

    expect(markup).toContain("Son los 9 avisos que coinciden");
    expect(markup).not.toContain("<a");
  });

  it("a mitad de la lista no dibuja nada: todavía faltan avisos", () => {
    expect(render({ kind: "partial" })).toBe("");
  });
});
