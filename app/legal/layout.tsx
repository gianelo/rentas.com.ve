import type { ReactNode } from "react";
import { Container } from "@/../components/layout/Container";
import { FormShell } from "@/../components/layout/FormShell";
import { Nav } from "@/../components/organisms/Nav";
import { resolveNavAccount, resolveNavPublish } from "@/modules/identity/domain/nav-account";
import styles from "./legal.module.css";

/**
 * The shared shell for the five Legal pages (tasks.md 23.5).
 *
 * Mirrors `app/ayuda/layout.tsx` rather than sharing it: extracting a
 * common shell would edit a file 23.4 already shipped, for two categories
 * free to diverge later (product copy vs. founder-ratified legal text).
 * Same static-content discipline: no session read, no query, no client
 * component (design.md D13/D14) — `Nav` always draws anonymous.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  const account = resolveNavAccount(null);
  const publish = resolveNavPublish(account);

  return (
    <>
      {/* Bare `/signin`, the same choice Ayuda's layout and app/page.tsx
          make for their own anonymous Nav. */}
      <Nav account={account} publish={publish} signInHref="/signin" />
      <main className={styles.page}>
        <Container>
          <FormShell>{children}</FormShell>
        </Container>
      </main>
    </>
  );
}
