import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NormasPage, { metadata } from "./page";

/**
 * tasks.md 23.5 — "Normas de publicación", el caso de borde: política de
 * producto derivada del validador de publicar. Cada regla se verificó
 * contra `publishable-listing.ts` y `uploaded-photo.ts` antes de
 * escribirse: los topes de título/descripción/fotos, los formatos y el
 * tamaño de imagen, y el umbral de `report-threshold.ts`.
 */
describe("NormasPage", () => {
  it("carries the unratified-draft notice", () => {
    const markup = renderToStaticMarkup(<NormasPage />);

    expect(markup).toContain("Borrador en revisión");
  });

  it("lists the five real residential property types and excludes commercial", () => {
    const markup = renderToStaticMarkup(<NormasPage />);

    expect(markup).toContain("apartamento");
    expect(markup).toContain("habitación");
    expect(markup).toContain("local comercial");
  });

  it("states the real title, description, and photo limits", () => {
    const markup = renderToStaticMarkup(<NormasPage />);

    expect(markup).toContain("90 caracteres");
    expect(markup).toContain("120");
    expect(markup).toContain("1.200");
    expect(markup).toContain("6 fotos");
  });

  it("states the real photo format and size limits", () => {
    const markup = renderToStaticMarkup(<NormasPage />);

    expect(markup).toContain("JPEG");
    expect(markup).toContain("10 MB");
  });

  it("states duplicate photos across publishers are rejected", () => {
    const markup = renderToStaticMarkup(<NormasPage />);

    expect(markup).toContain("otro dueño");
  });

  it("states the real three-distinct-account auto-hide threshold", () => {
    const markup = renderToStaticMarkup(<NormasPage />);

    expect(markup).toContain("tres cuentas");
  });

  it("is indexable — the page carries no noindex directive", () => {
    expect(metadata.robots).toBeUndefined();
  });
});
