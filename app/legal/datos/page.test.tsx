import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DatosPage, { metadata } from "./page";

/**
 * tasks.md 23.5 — "Tratamiento de datos", drafted by the agent for the
 * founder to ratify. A data inventory distinct from `/legal/privacidad`'s
 * general framework, traced to real columns (`contact_reveal_event` in
 * schema.ts) and the real processors already named on the privacy page.
 */
describe("DatosPage", () => {
  it("carries the unratified-draft notice", () => {
    const markup = renderToStaticMarkup(<DatosPage />);

    expect(markup).toContain("Borrador en revisión");
  });

  it("cross-links the general privacy policy rather than repeating it", () => {
    const markup = renderToStaticMarkup(<DatosPage />);

    expect(markup).toContain('href="/legal/privacidad"');
  });

  it("names the real contact-reveal record: listing, city, moment and message", () => {
    const markup = renderToStaticMarkup(<DatosPage />);

    expect(markup).toContain("qué aviso");
    expect(markup).toContain("mensaje");
  });

  it("names the real processors: Google, Resend, Neon and Cloudflare", () => {
    const markup = renderToStaticMarkup(<DatosPage />);

    expect(markup).toContain("Google");
    expect(markup).toContain("Resend");
    expect(markup).toContain("Neon");
    expect(markup).toContain("Cloudflare");
  });

  it("states data is not sold and no advertising profile is built", () => {
    const markup = renderToStaticMarkup(<DatosPage />);

    expect(markup).toContain("no vendemos");
  });

  it("is indexable — the page carries no noindex directive", () => {
    expect(metadata.robots).toBeUndefined();
  });
});
