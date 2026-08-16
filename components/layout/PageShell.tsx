import type { ReactNode } from "react";

/**
 * Landmark scaffold (tasks.md 1b.17, design.md D15 — "page structure uses
 * real headings and landmarks"). Exactly one `<header>`, one `<main>`, and
 * one optional `<footer>` per page. Not wired into the root layout
 * (app/layout.tsx): the sign-in page already renders its own top-level
 * `<main>` (PR1), and forcing a second one here would nest two `<main>`
 * landmarks on that page. Future pages compose this instead of the root
 * layout doing it for them.
 *
 * Carries no visual styling — heading and landmark typography is atoms
 * work (tasks.md 1b.5), out of scope for this slice.
 */
export function PageShell({
  header,
  children,
  footer,
}: {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      {header ? <header>{header}</header> : null}
      <main>{children}</main>
      {footer ? <footer>{footer}</footer> : null}
    </>
  );
}
