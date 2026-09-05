import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FooterLinkGroup } from "@/modules/site-footer/domain/footer-links";
import { SiteFooter } from "./SiteFooter";

describe("SiteFooter", () => {
  /**
   * The frame tasks.md 23.1 calls "the only shippable thing without a
   * single new page" — the wordmark, the tagline, and the two-line bottom
   * strip, verbatim (tasks.md's own quoted copy).
   */
  it("draws the wordmark, the tagline, and the two-line legal strip", () => {
    const markup = renderToStaticMarkup(<SiteFooter linkGroups={[]} />);

    // The wordmark as the sole text of its own anchor — not `toContain("rentas.")`,
    // which the copyright line's "rentas.com.ve" would also satisfy and hide
    // a typo in the wordmark itself (the same risk Nav.tsx's own comment
    // names for its two copies).
    expect(markup).toContain(">rentas.</a>");
    expect(markup).toContain(
      "Alquileres en Venezuela sin comisión. El dueño publica, el inquilino escribe directo.",
    );
    expect(markup).toContain("© 2026 rentas.com.ve · Publicar y contactar no cuesta nada");
    expect(markup).toContain("rentas.com.ve no interviene en el contrato entre las partes");
  });

  /**
   * tasks.md 23.2 / AGENTS.md §7 — fail closed. With today's real registry
   * resolving to zero groups, the frame ships with no link section at all:
   * this is the "correct and complete" state tasks.md names explicitly, not
   * a placeholder waiting to be filled.
   */
  it("draws no link heading and no link when no category resolves", () => {
    const markup = renderToStaticMarkup(<SiteFooter linkGroups={[]} />);

    expect(markup).not.toContain("Ayuda");
    expect(markup).not.toContain("Legal");
    expect(markup.match(/<a /g) ?? []).toHaveLength(1); // only the wordmark's own link
  });

  /**
   * Triangulates the empty case: with entries actually resolved, the
   * category heading AND every link render — proving the empty case above
   * comes from an empty prop, not from a component that never draws links
   * at all.
   */
  it("draws a category heading and its links when the registry resolves entries", () => {
    const linkGroups: readonly FooterLinkGroup[] = [
      {
        category: "ayuda",
        links: [
          { label: "Preguntas frecuentes", category: "ayuda", href: "/ayuda/preguntas-frecuentes" },
        ],
      },
    ];

    const markup = renderToStaticMarkup(<SiteFooter linkGroups={linkGroups} />);

    expect(markup).toContain("Ayuda");
    expect(markup).toContain("Preguntas frecuentes");
    expect(markup).toContain('href="/ayuda/preguntas-frecuentes"');
    expect(markup).not.toContain("Legal");
  });

  /**
   * Triangulates the category-to-heading mapping itself: without a "legal"
   * fixture, a heading map that mislabelled "legal" as "Ayuda" would pass
   * every test above unnoticed — proven, not assumed (the mutation ran
   * blank the first time this test file omitted this case).
   */
  it("labels the legal category as 'Legal', not as the help category's own label", () => {
    const linkGroups: readonly FooterLinkGroup[] = [
      {
        category: "legal",
        links: [{ label: "Términos y condiciones", category: "legal", href: "/legal/terminos" }],
      },
    ];

    const markup = renderToStaticMarkup(<SiteFooter linkGroups={linkGroups} />);

    expect(markup).toContain("Legal");
    expect(markup).not.toContain("Ayuda");
  });
});
