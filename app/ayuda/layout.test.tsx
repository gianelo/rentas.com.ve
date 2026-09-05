import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AyudaLayout from "./layout";

/**
 * tasks.md 23.4 — the shared shell for the five Ayuda pages.
 *
 * Synchronous on purpose, unlike `RootLayout` (which is `async` because it
 * reads `headers()`, tasks.md 23.3): there is nothing here to `await`, and a
 * component with no `await` cannot read a cookie or run a query. That is
 * the actual proof of "no session, no database" — not a comment promising
 * it.
 */
describe("AyudaLayout", () => {
  it("draws the anonymous Nav and the given content inside the form shell", () => {
    const markup = renderToStaticMarkup(
      <AyudaLayout>
        <h1>Título de prueba</h1>
      </AyudaLayout>,
    );

    // Anonymous, always — never a session read (see the module doc above).
    expect(markup).toContain("Entrar");
    expect(markup).toContain("<h1>Título de prueba</h1>");
  });

  it("draws no account menu, which only a signed-in Nav would render", () => {
    const markup = renderToStaticMarkup(<AyudaLayout>{null}</AyudaLayout>);

    expect(markup).not.toContain("Mis avisos");
  });
});
