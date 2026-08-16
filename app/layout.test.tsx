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

  it("renders its children inside <body>", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <p>content</p>
      </RootLayout>,
    );

    expect(markup).toContain("<body><p>content</p></body>");
  });
});
