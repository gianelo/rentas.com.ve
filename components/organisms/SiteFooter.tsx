import type { FooterLinkGroup } from "@/modules/site-footer/domain/footer-links";
import { AppLink } from "../atoms/AppLink";
import styles from "./SiteFooter.module.css";

/**
 * A single copy. SISTEMA.md fixes that there is no logo and that the mark IS
 * the word; the founder renamed the product to `rentoru.com` (tasks.md 26.2)
 * and chose "Rentoru" — capitalised and with NO trailing dot — so the mark and
 * the title suffix ("— Rentoru") are one single form. The trailing dot
 * SISTEMA.md:323 still describes belongs to the old name, and the board catches
 * up in its own slice (tasks.md 26.21/26.23). Nav.tsx already flags the same
 * risk in its own copy: this is retyped here rather than imported, so it is a
 * third occurrence and not a second.
 */
const WORDMARK = "Rentoru";

const TAGLINE =
  "Alquileres en Venezuela sin comisión. El dueño publica, el inquilino escribe directo.";

const COPYRIGHT_LINE = "© 2026 rentoru.com · Publicar y contactar no cuesta nada";
const DISCLAIMER_LINE = "rentoru.com no interviene en el contrato entre las partes";

const CATEGORY_LABELS = {
  ayuda: "Ayuda",
  legal: "Legal",
} as const;

export interface SiteFooterProps {
  /**
   * Already resolved and grouped by the caller (`resolveFooterLinks` +
   * `groupResolvedFooterLinks`, `src/modules/site-footer/domain`) — the
   * same contract `Nav` already uses for its account and its publish
   * button: this component does not decide which destinations exist, it
   * only draws the ones that already arrived resolved.
   */
  readonly linkGroups: readonly FooterLinkGroup[];
}

/**
 * The site footer (design/pantallas/Rentas - Footer.dc.html, artboards
 * 9a/9b; tasks.md 23.1).
 *
 * **The frame needs no link to say its own promise.** The brand, the
 * tagline, and the bottom strip always draw; the link columns are strictly
 * conditional on `linkGroups`, which arrives empty today (tasks.md 23.2 —
 * none of the ten destinations exist yet) and that is correct and
 * complete, not a half-finished state.
 *
 * **Mounts in `app/layout.tsx`, which is deliberately plain today.** This
 * component carries no `"use client"` and no state: it is server-rendered
 * HTML, same as the rest of the read path (design.md D13/D14).
 */
export function SiteFooter({ linkGroups }: SiteFooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.top}>
        <div className={styles.brand}>
          <AppLink className={styles.wordmark} href="/">
            {WORDMARK}
          </AppLink>
          <p className={styles.tagline}>{TAGLINE}</p>
        </div>

        {linkGroups.map((group) => (
          <div className={styles.column} key={group.category}>
            <span className={styles.heading}>{CATEGORY_LABELS[group.category]}</span>
            <ul className={styles.list}>
              {group.links.map((link) => (
                <li key={link.href}>
                  <AppLink className={styles.link} href={link.href}>
                    {link.label}
                  </AppLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={styles.strip}>
        <span className={styles.legal}>{COPYRIGHT_LINE}</span>
        <span className={styles.legal}>{DISCLAIMER_LINE}</span>
      </div>
    </footer>
  );
}
