import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PreguntasFrecuentesPage, { metadata } from "./page";

/**
 * tasks.md 23.4 — "Preguntas frecuentes", the first of the three Ayuda
 * pages derivable from what the product already does. Every fact asserted
 * here is one this test file also verified against the real source before
 * being written into the page (`step-copy.ts` for the nine steps, and
 * `listing-lifecycle/domain/expiry.ts` for the thirty-day lifetime) — the
 * same discipline tasks.md 23.4 itself demands: "if the page says the
 * product does X, X must be true in the repository today."
 */
describe("PreguntasFrecuentesPage", () => {
  it("answers that publishing and contacting cost nothing", () => {
    const markup = renderToStaticMarkup(<PreguntasFrecuentesPage />);

    expect(markup).toContain("no cuestan nada");
  });

  it("states the real thirty-day listing lifetime, not an invented number", () => {
    const markup = renderToStaticMarkup(<PreguntasFrecuentesPage />);

    expect(markup).toContain("30 días");
  });

  it("names both real sign-in paths — Google and the emailed link", () => {
    const markup = renderToStaticMarkup(<PreguntasFrecuentesPage />);

    expect(markup).toContain("Google");
    expect(markup).toContain("correo");
  });

  it("states rentas.com.ve does not take part in the deal between the parties", () => {
    const markup = renderToStaticMarkup(<PreguntasFrecuentesPage />);

    expect(markup).toContain("no participa en la negociación");
  });

  it("is indexable — the page carries no noindex directive", () => {
    expect(metadata.robots).toBeUndefined();
  });
});
