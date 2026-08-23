import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchSummaryBar } from "./SearchSummaryBar";

const SOURCE = readFileSync(new URL("./SearchSummaryBar.tsx", import.meta.url), "utf8");

function render(props: Partial<Parameters<typeof SearchSummaryBar>[0]> = {}) {
  return renderToStaticMarkup(
    <SearchSummaryBar
      backHref="/"
      headline="Chacao, Altamira"
      summary="9 avisos · $250 – $700 · 2 hab · dueños"
      activeFilters={4}
      openHref="/alquiler/distrito-capital?filtros=ciudad"
      {...props}
    />,
  );
}

describe("la barra resumen de resultados", () => {
  it("no es un componente de cliente", () => {
    expect(SOURCE.trimStart().startsWith('"use client"')).toBe(false);
  });

  it("encabeza con las zonas y resume debajo, con el conteo real adelante", () => {
    const markup = render();

    expect(markup).toContain("Chacao, Altamira");
    expect(markup).toContain("9 avisos · $250 – $700 · 2 hab · dueños");
  });

  it("el engranaje abre el acordeón, y es un enlace", () => {
    const markup = render();

    expect(markup).toContain('href="/alquiler/distrito-capital?filtros=ciudad"');
    expect(markup).not.toMatch(/onclick/i);
  });

  it("el número sólo aparece cuando hay filtros puestos", () => {
    expect(render({ activeFilters: 4 })).toContain(">4<");
    expect(render({ activeFilters: 0 })).not.toContain(">0<");
  });

  it("el enlace de volver es un enlace, y lleva su rótulo accesible", () => {
    const markup = render({ backHref: "/alquiler/distrito-capital" });

    expect(markup).toContain('href="/alquiler/distrito-capital"');
    expect(markup).toContain("aria-label");
  });
});
