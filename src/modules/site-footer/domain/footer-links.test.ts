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
   * The real production catalogue, today. 23.4 shipped the three Ayuda
   * pages; 23.5 shipped the five Legal drafts; this slice (23.6/23.7)
   * ships the last two — "Cómo reportar un aviso" (renamed from "Reportar
   * un aviso") and "Escribinos". Ten of ten resolve. Documents the state
   * as a checked fact, rewritten RED-first against the nine-entry state
   * this file held before this slice.
   */
  it("resolves all ten pages against today's real catalogue", () => {
    expect(resolveFooterLinks(FOOTER_LINK_CATALOGUE)).toEqual([
      { label: "Preguntas frecuentes", category: "ayuda", href: "/ayuda/preguntas-frecuentes" },
      {
        label: "Cómo publicar un aviso",
        category: "ayuda",
        href: "/ayuda/como-publicar-un-aviso",
      },
      {
        label: "Cómo contactar al dueño",
        category: "ayuda",
        href: "/ayuda/como-contactar-al-dueno",
      },
      {
        label: "Cómo reportar un aviso",
        category: "ayuda",
        href: "/ayuda/como-reportar-un-aviso",
      },
      { label: "Escribinos", category: "ayuda", href: "/ayuda/escribinos" },
      { label: "Términos y condiciones", category: "legal", href: "/legal/terminos" },
      { label: "Política de privacidad", category: "legal", href: "/legal/privacidad" },
      { label: "Uso de cookies", category: "legal", href: "/legal/cookies" },
      { label: "Normas de publicación", category: "legal", href: "/legal/normas" },
      { label: "Tratamiento de datos", category: "legal", href: "/legal/datos" },
    ]);
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
