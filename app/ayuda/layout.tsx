import type { ReactNode } from "react";
import { Container } from "@/../components/layout/Container";
import { FormShell } from "@/../components/layout/FormShell";
import { Nav } from "@/../components/organisms/Nav";
import { resolveNavAccount, resolveNavPublish } from "@/modules/identity/domain/nav-account";
import styles from "./ayuda.module.css";

/**
 * The shared shell for the five Ayuda pages (tasks.md 23.4).
 *
 * **Static, public content: no session read, no database query, and no
 * client component anywhere in this tree** — the same read-path discipline
 * design.md D13/D14 already requires. `Nav` always draws anonymous here on
 * purpose: reading the real session would turn a page with nothing
 * visitor-specific to say into one more query on every request, for a page
 * whose only visitor-specific control is "Entrar" — which the anonymous
 * state already draws correctly.
 *
 * **Known, accepted cost**: a signed-in visitor still sees "Entrar" on
 * these five pages, not their account menu. That is the trade this layout
 * makes to stay free of a session read, named here rather than left as a
 * silent surprise.
 */
export default function AyudaLayout({ children }: { children: ReactNode }) {
  const account = resolveNavAccount(null);
  const publish = resolveNavPublish(account);

  return (
    <>
      {/* Bare `/signin`, the same choice app/page.tsx documents for its own
          anonymous Nav: it returns to `/`, and a help page is not worth
          threading a callback through for it. */}
      <Nav account={account} publish={publish} signInHref="/signin" />
      <main className={styles.page}>
        <Container>
          <FormShell>{children}</FormShell>
        </Container>
      </main>
    </>
  );
}
