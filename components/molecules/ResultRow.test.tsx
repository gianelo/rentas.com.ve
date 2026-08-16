import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultRow } from "./ResultRow";

describe("ResultRow", () => {
  it("renders the price before the title in DOM order (SISTEMA.md)", () => {
    const markup = renderToStaticMarkup(
      <ResultRow
        priceUsd={450}
        title="Apartamento 2 habitaciones con puesto de estacionamiento"
        zone="Chacao"
        rooms={2}
        areaM2={65}
        publisherType="owner"
      />,
    );

    const priceIndex = markup.indexOf("$450");
    const titleIndex = markup.indexOf("Apartamento 2 habitaciones");
    expect(priceIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeGreaterThan(-1);
    expect(priceIndex).toBeLessThan(titleIndex);
    expect(markup).toContain("Chacao · 2 hab · 65 m²");
  });
});
