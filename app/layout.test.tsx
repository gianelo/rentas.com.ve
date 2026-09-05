import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout from "./layout";

// design.md D16, tasks.md 1b.2 — data-theme / data-layout are set exactly
// once, on the root element, in the app shell. No component reads either
// attribute; every themed value is resolved through the CSS custom
// properties these two attributes select in src/styles/tokens.css.
describe("RootLayout", () => {
  it("sets data-theme=menta and data-layout=compacto on <html>, and lang=es", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <p>content</p>
      </RootLayout>,
    );

    expect(markup).toContain('data-theme="menta"');
    expect(markup).toContain('data-layout="compacto"');
    expect(markup).toContain('lang="es"');
  });

  it("renders its children inside <body>, before the site footer", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <p>content</p>
      </RootLayout>,
    );

    const bodyStart = markup.indexOf("<body>");
    const childIndex = markup.indexOf("<p>content</p>");
    const footerIndex = markup.indexOf("<footer");
    expect(bodyStart).toBeGreaterThanOrEqual(0);
    expect(childIndex).toBeGreaterThan(bodyStart);
    expect(footerIndex).toBeGreaterThan(childIndex);
  });

  /**
   * tasks.md 23.1 — the site footer mounts here, on every page, and is not
   * the first thing to break the plain-HTML shell this test's own describe
   * block documents: no client component appears anywhere in the markup.
   */
  it("mounts the site footer on every page", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <p>content</p>
      </RootLayout>,
    );

    expect(markup).toContain("<footer");
    expect(markup).toContain("rentas.");
    expect(markup).toContain("© 2026 rentas.com.ve · Publicar y contactar no cuesta nada");
  });
});
