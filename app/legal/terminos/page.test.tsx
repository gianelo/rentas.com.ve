import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TerminosPage, { metadata } from "./page";

/**
 * tasks.md 23.5 — "Términos y condiciones", drafted by the agent for the
 * founder to ratify. Every fact asserted here was verified against the
 * real source first: `publishable-listing.ts`, `expiry.ts`, `auth.ts`,
 * `report-threshold.ts`.
 */
describe("TerminosPage", () => {
  it("carries the unratified-draft notice", () => {
    const markup = renderToStaticMarkup(<TerminosPage />);

    expect(markup).toContain("Borrador en revisión");
  });

  // The name promises the site's own name and the body never looked at it,
  // so a rename left this green with the old brand still on the page
  // (tasks.md 26.13). Both halves are asserted now.
  it("states rentoru.com takes no part in the deal between the parties", () => {
    const markup = renderToStaticMarkup(<TerminosPage />);

    expect(markup).toContain("rentoru.com conecta a quien publica un aviso");
    expect(markup).toContain("no participa en la negociación");
  });

  it("names the two real publisher roles, owner and broker", () => {
    const markup = renderToStaticMarkup(<TerminosPage />);

    expect(markup).toContain("dueño");
    expect(markup).toContain("inmobiliaria");
  });

  it("states the real thirty-day listing lifetime", () => {
    const markup = renderToStaticMarkup(<TerminosPage />);

    expect(markup).toContain("30 días");
  });

  it("names both real sign-in paths — Google and the emailed link", () => {
    const markup = renderToStaticMarkup(<TerminosPage />);

    expect(markup).toContain("Google");
    expect(markup).toContain("correo");
  });

  it("states the real three-distinct-account auto-hide threshold", () => {
    const markup = renderToStaticMarkup(<TerminosPage />);

    expect(markup).toContain("tres cuentas");
  });

  it("links to the real publication-rules page", () => {
    const markup = renderToStaticMarkup(<TerminosPage />);

    expect(markup).toContain('href="/legal/normas"');
  });

  it("is indexable — the page carries no noindex directive", () => {
    expect(metadata.robots).toBeUndefined();
  });
});
