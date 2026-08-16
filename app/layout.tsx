import type { Metadata } from "next";
import type { ReactNode } from "react";

// The read path ships no client-side JavaScript and no webfonts (design.md,
// D13/D14). The root layout stays plain HTML with the system font stack —
// no <link> to a webfont, no font-loading component, no client component.
export const metadata: Metadata = {
  title: "Rentas",
  description: "Free long-stay residential rental marketplace for Venezuela.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
