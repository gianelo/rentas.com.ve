import type { Metadata } from "next";
import { headers } from "next/headers";
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  // tasks.md 23.3 — DECIDIDA 2026-09-04. The site footer stays silent on the
  // listing detail page and the photo viewer: the detail page's own
  // <footer> already carries the listing's ID and expiry (16.35), which is
  // data about the LISTING, not the site, and the photo viewer's <footer>
  // is a control bar for an immersive full-screen view, not a footer at
  // all. Stacking the site footer under either one is a defect, not a sum;
  // both keep exactly the footer they already had. This layout has no
  // client hook and no state to ask which route it is serving, so
  // middleware.ts scopes itself to exactly those two routes and stamps this
  // one header; its absence means "render the site footer".
  //
  // Known cost, measured 2026-09-04: calling `headers()` here opts every
  // route into dynamic rendering. `/_not-found`, `/measure`, and
  // `/measure/lista` flipped from static (○) to dynamic (ƒ) in the build
  // output the day this landed; `budget:bundle` is unchanged (110.67 KB
  // gzip) because dynamic vs. static does not change the client bundle it
  // measures. The founder accepted this cost. It matters for tasks.md 23.9:
  // the ten upcoming Ayuda/Legales pages are declared "contenido estático y
  // público … no tienen por qué costar una consulta", and as long as this
  // layout reads `headers()`, none of them can prerender either — a known
  // follow-up, not solved here.
  const hideSiteFooter = (await headers()).get("x-hide-site-footer") === "1";
  return (
    <html lang="es" data-theme="menta" data-layout="compacto">
      <body>
        {children}
        {!hideSiteFooter && <SiteFooter linkGroups={FOOTER_LINK_GROUPS} />}
      </body>
    </html>
  );
}
