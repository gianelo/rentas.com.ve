import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacidadPage, { metadata } from "./page";

/**
 * tasks.md 23.5 — "Política de privacidad", drafted by the agent for the
 * founder to ratify. Verified first: `toMinimalGoogleProfile` (name + email
 * only), `enlace.ts`, `resend-lifecycle-mailer.ts`, and the real
 * `hola@rentas.com.ve` address already used in `PublishStep.tsx`.
 */
describe("PrivacidadPage", () => {
  it("carries the unratified-draft notice", () => {
    const markup = renderToStaticMarkup(<PrivacidadPage />);

    expect(markup).toContain("Borrador en revisión");
  });

  it("states Google sign-in captures only name and email, no picture", () => {
    const markup = renderToStaticMarkup(<PrivacidadPage />);

    expect(markup).toContain("nombre y el correo");
    expect(markup).toContain("ninguna foto");
  });

  it("names the real processors: Google, Resend, Neon and Cloudflare", () => {
    const markup = renderToStaticMarkup(<PrivacidadPage />);

    expect(markup).toContain("Google");
    expect(markup).toContain("Resend");
    expect(markup).toContain("Neon");
    expect(markup).toContain("Cloudflare");
  });

  it("states data is not sold or used for advertising", () => {
    const markup = renderToStaticMarkup(<PrivacidadPage />);

    expect(markup).toContain("no vendemos");
  });

  it("gives the real contact address for exercising rights", () => {
    const markup = renderToStaticMarkup(<PrivacidadPage />);

    expect(markup).toContain("hola@rentas.com.ve");
  });

  it("links to the cookies page", () => {
    const markup = renderToStaticMarkup(<PrivacidadPage />);

    expect(markup).toContain('href="/legal/cookies"');
  });

  it("is indexable — the page carries no noindex directive", () => {
    expect(metadata.robots).toBeUndefined();
  });
});
