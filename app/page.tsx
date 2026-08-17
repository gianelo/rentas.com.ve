import type { Metadata } from "next";
import { Container } from "../components/layout/Container";
import { PageShell } from "../components/layout/PageShell";
import { ReadingWidth } from "../components/layout/ReadingWidth";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Rentas — Alquileres de larga estancia en Venezuela",
  description:
    "Publicar y buscar alquileres residenciales de larga estancia en Venezuela, sin comisiones ni intermediarios.",
};

/**
 * The site root. Until this shipped, `/` returned Next's built-in 404 — the
 * only real route was `/signin`, which itself redirects here after a
 * successful sign-in, so the one working flow ended on a 404.
 *
 * Server component, no client JavaScript, plain <a> rather than next/link:
 * design.md D13 promises the read path ships none, and next/link would add
 * a client boundary to buy prefetching this page does not need. No other
 * route in the app imports next/link either.
 *
 * The copy is deliberately narrow. Search is Phase 5 and publication is
 * Phase 3; neither exists, so this page states what the product is and
 * offers the single action that actually works today. A hero with a
 * non-functional search box would have moved the 404 one click deeper
 * instead of removing it — see app/page.test.tsx, which asserts exactly
 * that and will fail the day someone adds a control this page cannot honour.
 *
 * Spanish UI copy follows the shipped convention (components/molecules/
 * CityZoneSelect.tsx, and <html lang="es"> in app/layout.tsx), in a neutral
 * register with no regional second person.
 */
export default function HomePage() {
  return (
    <PageShell
      header={
        <div className={styles.masthead}>
          <Container>
            <p className={styles.brand}>Rentas</p>
          </Container>
        </div>
      }
      footer={
        <div className={styles.colophon}>
          <Container>
            <p>Rentas — alquileres residenciales de larga estancia en Venezuela.</p>
          </Container>
        </div>
      }
    >
      <div className={styles.content}>
        <Container>
          <ReadingWidth>
            <h1 className={styles.title}>Alquileres de larga estancia en Venezuela</h1>
            <p className={styles.lead}>
              Publicar es gratis y buscar también. El contacto es directo con quien publica: sin
              comisiones, sin intermediarios y sin cobros por ver un teléfono.
            </p>
            <p className={styles.notice}>
              El buscador y la publicación de avisos todavía no están disponibles. Por ahora se
              puede crear la cuenta, para publicar en cuanto abra.
            </p>
            <a className={styles.cta} href="/signin">
              Crear cuenta o iniciar sesión
            </a>
          </ReadingWidth>
        </Container>
      </div>
    </PageShell>
  );
}
