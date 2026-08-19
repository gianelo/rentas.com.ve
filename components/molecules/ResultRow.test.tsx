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

/**
 * Artboard 2a shows two different metadata sentences: `zona · N hab · N m²`
 * on a phone, and `zona · ciudad · N hab · N m² · hace 4 días` at 1280. The
 * extra words exist in the DOM at both widths and are revealed by CSS, so
 * these assert the markup carries them and `tests/measure/layout.spec.ts`
 * asserts which width shows them.
 */
describe("ResultRow — the fuller sentence 2a shows at 1280", () => {
  it("carries city and age in the markup even though a phone hides them", () => {
    const markup = renderToStaticMarkup(
      <ResultRow
        priceUsd={450}
        title="Apartamento 2 habitaciones con puesto de estacionamiento"
        zone="Chacao"
        city="Distrito Capital"
        ageLabel="hace 2 días"
        rooms={2}
        areaM2={78}
        publisherType="owner"
      />,
    );

    // Present in the DOM, not conditionally rendered: a crawler reads the
    // page with no viewport, and D11 wants these surfaces indexable.
    expect(markup).toContain("Distrito Capital");
    expect(markup).toContain("hace 2 días");
  });

  it("omits them entirely when the caller has neither", () => {
    const markup = renderToStaticMarkup(
      <ResultRow
        priceUsd={450}
        title="T"
        zone="Chacao"
        rooms={2}
        areaM2={78}
        publisherType="owner"
      />,
    );

    // No stray separators. A row reading "Chacao ·  · 2 hab" is what happens
    // when an optional field is rendered unconditionally.
    expect(markup).not.toMatch(/·\s*·/);
  });

  it("links only the title, never the whole row", () => {
    const markup = renderToStaticMarkup(
      <ResultRow
        priceUsd={450}
        title="Apartamento en Chacao"
        zone="Chacao"
        rooms={2}
        areaM2={78}
        publisherType="owner"
        href="/alquiler/distrito-capital/chacao/apartamento-en-chacao-abc"
      />,
    );

    // A row wrapped in an anchor makes every word of metadata sound like a
    // destination when read aloud.
    expect(markup.match(/<a /g) ?? []).toHaveLength(1);
    expect(markup).toContain('href="/alquiler/distrito-capital/chacao/apartamento-en-chacao-abc"');
  });

  it("renders a plain title when there is nowhere to go", () => {
    const markup = renderToStaticMarkup(
      <ResultRow
        priceUsd={450}
        title="T"
        zone="Chacao"
        rooms={2}
        areaM2={78}
        publisherType="owner"
      />,
    );

    expect(markup).not.toContain("<a ");
  });
});
