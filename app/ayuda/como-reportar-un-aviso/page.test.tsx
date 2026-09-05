import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ComoReportarPage, { metadata } from "./page";

/**
 * tasks.md 23.6 (DECIDIDA 2026-09-04) — "Cómo reportar un aviso" EXPLICA
 * cómo se reporta y desde dónde; no reporta nada desde acá. Cada hecho que
 * esta prueba pide fue verificado contra el código real antes de escribirse
 * en la página, la misma disciplina que 23.4 ya siguió: la ruta de reportar
 * vive en la ficha (`app/alquiler/.../[slug]/reportar/page.tsx`), exige
 * sesión (`reportarAviso` redirige a `/signin` sin ella), y el umbral de
 * ocultamiento automático es tres cuentas distintas
 * (`listing-trust/domain/report-threshold.ts::AUTO_HIDE_REPORT_THRESHOLD`).
 */
describe("ComoReportarPage", () => {
  it("says reporting happens from the listing's own page, not from here", () => {
    const markup = renderToStaticMarkup(<ComoReportarPage />);

    expect(markup).toContain("Reportar este aviso");
  });

  it("states that reporting requires being signed in", () => {
    const markup = renderToStaticMarkup(<ComoReportarPage />);

    expect(markup).toContain("entrar con tu cuenta");
  });

  it("states one report counts per account, not per visit", () => {
    const markup = renderToStaticMarkup(<ComoReportarPage />);

    expect(markup).toContain("una vez por cuenta");
  });

  it("names the real auto-hide threshold — three distinct accounts, not an invented number", () => {
    const markup = renderToStaticMarkup(<ComoReportarPage />);

    expect(markup).toContain("tres cuentas distintas");
  });

  it("does not promise to reveal whether a specific report hid the listing", () => {
    const markup = renderToStaticMarkup(<ComoReportarPage />);

    expect(markup).toContain("No te vamos a decir");
  });

  it("points to Escribinos for anything that is not about a specific listing", () => {
    const markup = renderToStaticMarkup(<ComoReportarPage />);

    expect(markup).toContain("/ayuda/escribinos");
  });

  it("is indexable — the page carries no noindex directive", () => {
    expect(metadata.robots).toBeUndefined();
  });
});
