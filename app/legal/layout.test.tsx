import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LegalLayout from "./layout";

/**
 * tasks.md 23.5 — the shared shell for the five Legal pages. Same proof
 * shape as `app/ayuda/layout.test.tsx`: synchronous, so nothing here can
 * read a cookie or run a query.
 */
describe("LegalLayout", () => {
  it("draws the anonymous Nav and the given content inside the form shell", () => {
    const markup = renderToStaticMarkup(
      <LegalLayout>
        <h1>Título de prueba</h1>
      </LegalLayout>,
    );

    expect(markup).toContain("Entrar");
    expect(markup).toContain("<h1>Título de prueba</h1>");
  });

  it("draws no account menu, which only a signed-in Nav would render", () => {
    const markup = renderToStaticMarkup(<LegalLayout>{null}</LegalLayout>);

    expect(markup).not.toContain("Mis avisos");
  });
});
