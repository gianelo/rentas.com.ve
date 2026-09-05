import { describe, expect, it } from "vitest";
import {
  FOOTER_LINK_CATALOGUE,
  type FooterLinkDefinition,
  groupResolvedFooterLinks,
  resolveFooterLinks,
} from "./footer-links";

/**
 * Two entries with a destination and one without, so the filter has both a
 * true and a false case to tell apart — proving it filters, not that it
 * happens to return everything or nothing (tasks.md 23.2, AGENTS.md §7).
 */
const MIXED_CATALOGUE: readonly FooterLinkDefinition[] = [
  { label: "Preguntas frecuentes", category: "ayuda", href: "/ayuda/preguntas-frecuentes" },
  { label: "Reportar un aviso", category: "ayuda", href: null },
  { label: "Términos y condiciones", category: "legal", href: "/legal/terminos" },
];

describe("resolveFooterLinks", () => {
  it("keeps only the entries that declare a destination", () => {
    const resolved = resolveFooterLinks(MIXED_CATALOGUE);

    expect(resolved.map((link) => link.label)).toEqual([
      "Preguntas frecuentes",
      "Términos y condiciones",
    ]);
  });

  it("carries the href through untouched for a resolved entry", () => {
    const resolved = resolveFooterLinks(MIXED_CATALOGUE);

    expect(resolved[0]?.href).toBe("/ayuda/preguntas-frecuentes");
  });

  /**
   * The real production catalogue, today. Ten labels are named in the
   * artboard and none of the ten destinations exist yet (tasks.md 23.4-23.7
   * are the founder decisions that fill them in one at a time). This test
   * documents that state as a checked fact rather than a claim in prose —
   * and it is meant to start failing the day the first `href` lands, which
   * is the correct way for it to fail.
   */
  it("resolves to nothing against today's real catalogue — none of the ten pages exist yet", () => {
    expect(resolveFooterLinks(FOOTER_LINK_CATALOGUE)).toEqual([]);
  });
});

describe("groupResolvedFooterLinks", () => {
  it("returns no groups for an empty link list", () => {
    expect(groupResolvedFooterLinks([])).toEqual([]);
  });

  it("drops a category entirely when it has no resolved link", () => {
    const groups = groupResolvedFooterLinks([
      { label: "Preguntas frecuentes", category: "ayuda", href: "/ayuda/preguntas-frecuentes" },
    ]);

    expect(groups.map((group) => group.category)).toEqual(["ayuda"]);
  });

  it("orders categories ayuda-then-legal regardless of input order", () => {
    const groups = groupResolvedFooterLinks([
      { label: "Términos y condiciones", category: "legal", href: "/legal/terminos" },
      { label: "Preguntas frecuentes", category: "ayuda", href: "/ayuda/preguntas-frecuentes" },
    ]);

    expect(groups.map((group) => group.category)).toEqual(["ayuda", "legal"]);
    expect(groups[0]?.links.map((link) => link.label)).toEqual(["Preguntas frecuentes"]);
    expect(groups[1]?.links.map((link) => link.label)).toEqual(["Términos y condiciones"]);
  });
});
