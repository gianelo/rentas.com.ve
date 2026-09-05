import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  FOOTER_LINK_CATALOGUE,
  groupResolvedFooterLinks,
  resolveFooterLinks,
} from "@/modules/site-footer/domain/footer-links";
import { SiteFooter } from "../components/organisms/SiteFooter";
import "@/styles/tokens.css";
import "@/styles/base.css";

// The read path ships no client-side JavaScript and no webfonts (design.md,
// D13/D14). The root layout stays plain HTML with the system font stack —
// no <link> to a webfont, no font-loading component, no client component.
// `SiteFooter` (tasks.md 23.1) is not the first thing to break that: it
// carries no "use client" and no state, and its own file says so.
//
// data-theme / data-layout (design.md D16, tasks.md 1b.2) are set here,
// once, on the root element. No component reads either attribute directly —
// every component resolves colour, radius, and geometry through the CSS
// custom properties these two attributes select in src/styles/tokens.css.
export const metadata: Metadata = {
  title: "Rentas",
  description: "Free long-stay residential rental marketplace for Venezuela.",
};

// tasks.md 23.1/23.2 — the site footer. `linkGroups` is resolved once, here,
// from the product-rule registry in `src/modules/site-footer/domain`
// (AGENTS.md §7 — fail closed): today it resolves to zero groups, because
// none of the ten destinations the design names exists yet, and an empty
// footer link section is the correct, complete state tasks.md 23.2
// describes, not a placeholder.
const FOOTER_LINK_GROUPS = groupResolvedFooterLinks(resolveFooterLinks(FOOTER_LINK_CATALOGUE));

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" data-theme="menta" data-layout="compacto">
      <body>
        {children}
        <SiteFooter linkGroups={FOOTER_LINK_GROUPS} />
      </body>
    </html>
  );
}
