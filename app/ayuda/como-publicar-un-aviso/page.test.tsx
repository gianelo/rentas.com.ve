import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ComoPublicarPage, { metadata } from "./page";

/**
 * tasks.md 23.4 — "Cómo publicar un aviso", derived from the nine real
 * publish steps (`app/publicar/step-copy.ts`), never from generic
 * classified-ad boilerplate.
 */
describe("ComoPublicarPage", () => {
  it("names all nine real publish steps, in order", () => {
    const markup = renderToStaticMarkup(<ComoPublicarPage />);

    const steps = [
      "Tipo",
      "Zona",
      "Precio",
      "Tamaño",
      "Qué tiene",
      "Título",
      "Descripción",
      "Fotos",
      "Quién publica",
    ];

    let lastIndex = -1;
    for (const step of steps) {
      const index = markup.indexOf(step);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("states publishing needs an account, and names both real sign-in paths", () => {
    const markup = renderToStaticMarkup(<ComoPublicarPage />);

    expect(markup).toContain("Google");
    expect(markup).toContain("correo");
  });

  it("states the real thirty-day listing lifetime, not an invented number", () => {
    const markup = renderToStaticMarkup(<ComoPublicarPage />);

    expect(markup).toContain("30 días");
  });

  it("is indexable — the page carries no noindex directive", () => {
    expect(metadata.robots).toBeUndefined();
  });
});
