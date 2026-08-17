import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles/tokens.css";
import "@/styles/base.css";

// The read path ships no client-side JavaScript and no webfonts (design.md,
// D13/D14). The root layout stays plain HTML with the system font stack —
// no <link> to a webfont, no font-loading component, no client component.
//
// data-theme / data-layout (design.md D16, tasks.md 1b.2) are set here,
// once, on the root element. No component reads either attribute directly —
// every component resolves colour, radius, and geometry through the CSS
// custom properties these two attributes select in src/styles/tokens.css.
export const metadata: Metadata = {
  title: "Rentas",
  description: "Free long-stay residential rental marketplace for Venezuela.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" data-theme="menta" data-layout="compacto">
      <body>{children}</body>
    </html>
  );
}
