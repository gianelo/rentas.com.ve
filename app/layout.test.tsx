import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// tasks.md 26.12 — el layout ahora arma `metadataBase` con `readSiteBaseUrl()`
// en el cuerpo del módulo, así que sin origen **el import se cae**. No es un
// accidente de la prueba: es el fallo cerrado del AGENTS.md §7, y
// `metadata-canonica.test.ts` lo afirma como comportamiento. Acá sólo se le da
// un origen para poder mirar lo demás.
vi.hoisted(() => {
  process.env.SITE_URL ??= "https://ejemplo.test";
});

const { headersGet } = vi.hoisted(() => ({
  headersGet: vi.fn((): string | null => null),
}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));

import RootLayout from "./layout";

// design.md D16, tasks.md 1b.2 — data-theme / data-layout are set exactly
// once, on the root element, in the app shell. No component reads either
// attribute; every themed value is resolved through the CSS custom
// properties these two attributes select in src/styles/tokens.css.
//
// RootLayout is invoked directly (not through <RootLayout>/renderToStaticMarkup,
// the pattern app/publicar/borrador-en-la-tabla.test.tsx already uses for an
// async server component) because it now reads `headers()` — this mirrors
// what middleware.ts actually stamps on the real request.
async function render(hideSiteFooterHeader: string | null): Promise<string> {
  headersGet.mockReturnValue(hideSiteFooterHeader);
  const element = await RootLayout({ children: <p>content</p> });
  return renderToStaticMarkup(element);
}

describe("RootLayout", () => {
  it("sets data-theme=menta and data-layout=compacto on <html>, and lang=es", async () => {
    const markup = await render(null);

    expect(markup).toContain('data-theme="menta"');
    expect(markup).toContain('data-layout="compacto"');
    expect(markup).toContain('lang="es"');
  });

  it("renders its children inside <body>, before the site footer", async () => {
    const markup = await render(null);

    const bodyStart = markup.indexOf("<body>");
    const childIndex = markup.indexOf("<p>content</p>");
    const footerIndex = markup.indexOf("<footer");
    expect(bodyStart).toBeGreaterThanOrEqual(0);
    expect(childIndex).toBeGreaterThan(bodyStart);
    expect(footerIndex).toBeGreaterThan(childIndex);
  });

  /**
   * tasks.md 23.1 — the site footer mounts here, on every ordinary page, and
   * is not the first thing to break the plain-HTML shell this test's own
   * describe block documents: no client component appears anywhere in the
   * markup.
   */
  it("mounts the site footer on an ordinary route", async () => {
    const markup = await render(null);

    expect(markup).toContain("<footer");
    // The wordmark as the sole text of its own anchor. This used to be a
    // bare `toContain("rentas.")`, which the copyright line's own
    // "rentas.com.ve" already satisfied — so the assertion passed without
    // ever looking at the wordmark, and a typo in the mark itself went
    // through. SiteFooter.test.tsx had already fixed exactly this in its
    // own file; this one had not been updated (tasks.md 26.13).
    expect(markup).toContain(">Rentoru</a>");
    expect(markup).toContain("© 2026 rentoru.com · Publicar y contactar no cuesta nada");
  });

  /**
   * tasks.md 23.3 — DECIDIDA 2026-09-04. The listing detail page's own
   * <footer> already carries the listing's ID and expiry (16.35) — data
   * about the LISTING, not the site — so stacking the site footer under it
   * is a defect, not a sum. `x-hide-site-footer` is what middleware.ts
   * stamps on the real request for this exact route; this drives the same
   * signal directly, the way `next/headers`'s `cookies()` is already mocked
   * in app/publicar/borrador-en-la-tabla.test.tsx.
   */
  it("does not mount the site footer when the request was stamped for it", async () => {
    const markup = await render("1");

    expect(markup).not.toContain("<footer");
    // The pair of the negative: children still render, so an empty markup
    // would not pass this test by accident.
    expect(markup).toContain("<p>content</p>");
  });
});
