import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FilterChip } from "@/modules/listing-search/domain/search-panel";
import { FilterChips } from "./FilterChips";

const CHIPS: readonly FilterChip[] = [
  {
    label: "Chacao",
    removeHref: "/alquiler/distrito-capital/altamira",
    removeLabel: "Quitar Chacao",
  },
  {
    label: "Hasta $700",
    removeHref: "/alquiler/distrito-capital",
    removeLabel: "Quitar Hasta $700",
  },
];

function render(chips: readonly FilterChip[] = CHIPS, clearAllHref = "/alquiler/distrito-capital") {
  return renderToStaticMarkup(<FilterChips chips={chips} clearAllHref={clearAllHref} />);
}

describe("las fichas quitables de la lámina 7c", () => {
  it("sin filtros puestos no dibuja nada: una fila vacía es cromo", () => {
    expect(render([])).toBe("");
  });

  it("cada filtro puesto se lee, y se saca sin abrir el panel", () => {
    const markup = render();

    expect(markup).toContain("Chacao");
    expect(markup).toContain("Hasta $700");
    expect(markup).toContain('href="/alquiler/distrito-capital/altamira"');
  });

  it("el «×» lleva su etiqueta al lado, porque solo no se lee en voz alta", () => {
    const markup = render();

    // El glifo es un carácter y va `aria-hidden`; lo que un lector anuncia es
    // la etiqueta que el dominio escribió.
    expect(markup).toContain('aria-label="Quitar Chacao"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it("«Limpiar todo» va al lado de las fichas, como en la lámina", () => {
    const markup = render();

    expect(markup).toContain("Limpiar todo");
  });

  it("no cuelga ni un manejador de eventos: son direcciones", () => {
    expect(render()).not.toMatch(/onclick|onchange|oninput|onsubmit/i);
  });
});
