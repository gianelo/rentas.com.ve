/**
 * The site footer's catalogue of destinations, and the rule that decides
 * which ones a visitor ever sees (tasks.md 23.2; AGENTS.md §7 — fail closed).
 *
 * Ten labels are named in `design/pantallas/Rentas - Footer.dc.html` and NOT
 * ONE of the ten pages they point to exists yet — five are blocked on the
 * founder's Help copy (tasks.md 23.4), five on ratifying Legal drafts
 * (tasks.md 23.5), and two more ("Reportar un aviso", "Escribinos") on
 * decisions the founder has not made yet (tasks.md 23.6, 23.7). Rendering
 * all ten today would be ten dead links repeated on every page of the site,
 * indexed from all of them — the alternative tasks.md 23.2 explicitly
 * rejects as an intermediate step.
 *
 * This module is the single place that knows the full catalogue and its
 * current state. `resolveFooterLinks` filters it down to what is safe to
 * draw; a caller that skipped the filter and rendered `FOOTER_LINK_CATALOGUE`
 * directly would draw ten broken anchors, which is exactly the outcome this
 * module exists to prevent.
 *
 * Lives in `src/modules/` and not in the component: which destinations exist
 * is a product rule, and `app/`/`components/` carry no coverage floor to
 * protect it (AGENTS.md — "no business rules in the front").
 */

export type FooterLinkCategory = "ayuda" | "legal";

export interface FooterLinkDefinition {
  readonly label: string;
  readonly category: FooterLinkCategory;
  /** `null` while the destination page does not exist. A `null` entry is
   *  the declared reason a link is absent, not an oversight. */
  readonly href: string | null;
}

export interface ResolvedFooterLink {
  readonly label: string;
  readonly category: FooterLinkCategory;
  readonly href: string;
}

export interface FooterLinkGroup {
  readonly category: FooterLinkCategory;
  readonly links: readonly ResolvedFooterLink[];
}

/**
 * The ten destinations the design names, each with the task that owns
 * filling in its `href`. Shipping a page is then a one-line change here —
 * no other file changes, and nothing renders until the line changes.
 */
export const FOOTER_LINK_CATALOGUE: readonly FooterLinkDefinition[] = [
  // tasks.md 23.4 — shipped. Derivable from the product as it already
  // stands, with no new product decision behind any of the three.
  { label: "Preguntas frecuentes", category: "ayuda", href: "/ayuda/preguntas-frecuentes" },
  { label: "Cómo publicar un aviso", category: "ayuda", href: "/ayuda/como-publicar-un-aviso" },
  {
    label: "Cómo contactar al dueño",
    category: "ayuda",
    href: "/ayuda/como-contactar-al-dueno",
  },
  { label: "Reportar un aviso", category: "ayuda", href: null }, // tasks.md 23.6
  { label: "Escribinos", category: "ayuda", href: null }, // tasks.md 23.7
  { label: "Términos y condiciones", category: "legal", href: null }, // tasks.md 23.5
  { label: "Política de privacidad", category: "legal", href: null }, // tasks.md 23.5
  { label: "Uso de cookies", category: "legal", href: null }, // tasks.md 23.5
  { label: "Normas de publicación", category: "legal", href: null }, // tasks.md 23.5
  { label: "Tratamiento de datos", category: "legal", href: null }, // tasks.md 23.5
];

/**
 * The one place that turns "declares a destination" into "gets drawn"
 * (AGENTS.md §7). Pure and parameterised over the catalogue on purpose: the
 * production caller passes `FOOTER_LINK_CATALOGUE`, and a test can pass one
 * with some entries resolved and some not, to prove the filter runs rather
 * than passing everything through by coincidence.
 */
export function resolveFooterLinks(
  catalogue: readonly FooterLinkDefinition[],
): readonly ResolvedFooterLink[] {
  return catalogue.filter(
    (entry): entry is FooterLinkDefinition & { href: string } => entry.href !== null,
  );
}

const CATEGORY_ORDER: readonly FooterLinkCategory[] = ["ayuda", "legal"];

/**
 * Groups resolved links by category, in a fixed order, and drops a category
 * entirely when it has no resolved link — a heading with nothing under it
 * is worse than no heading.
 */
export function groupResolvedFooterLinks(
  links: readonly ResolvedFooterLink[],
): readonly FooterLinkGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    links: links.filter((link) => link.category === category),
  })).filter((group) => group.links.length > 0);
}
