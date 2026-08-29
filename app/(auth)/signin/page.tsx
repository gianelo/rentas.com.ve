import type { Metadata } from "next";
import { AppLink } from "../../../components/atoms/AppLink";
import { ActionButton } from "../../../components/atoms/buttons";
import { Container } from "../../../components/layout/Container";
import { signInPageFor } from "../../../src/modules/identity/domain/sign-in-page";
import { signIn } from "../../../src/modules/identity/infrastructure/auth";
import styles from "./signin.module.css";

export const metadata: Metadata = {
  title: "Entrar — Rentas",
};

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}

/**
 * **La puerta que tiene su propia dirección** (15.7, láminas 8a/9a). La hoja de
 * la 15.8 no cambia la dirección; ésta es la que se pega en un correo y a la
 * que Google devuelve. **Acá no se decide nada**: lo resuelve `signInPageFor`.
 * **Sin `"use client"` y sin la marca de Google**: el botón es un `<form>` con
 * Server Action, y el disco de cuatro colores sería el tercer SVG del sistema
 * — misma decisión que la hoja, anotada en la 22.20.
 */
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { callbackUrl } = await searchParams;
  const page = signInPageFor(callbackUrl);
  const returnTo = page.returnTo;

  async function continueWithGoogle() {
    "use server";
    // `returnTo` ya pasó por `safeSignInReturn`. `callbacks.redirect` lo vuelve
    // a juzgar del otro lado del viaje: son dos momentos, no dos reglas.
    await signIn("google", { redirectTo: returnTo ?? "/" });
  }

  return (
    <div className={styles.screen}>
      <header className={styles.bar}>
        <Container>
          <div className={styles.barInner}>
            <AppLink className={styles.brand} href="/">
              rentas.
            </AppLink>
            <AppLink className={styles.back} href={page.wayOut.href}>
              {page.wayOut.label}
            </AppLink>
          </div>
        </Container>
      </header>

      <main>
        <Container>
          <div className={styles.grid}>
            <div data-testid="entrar-columna">
              <h1 className={styles.title}>{page.title}</h1>
              <p className={styles.reason}>{page.reason}</p>

              <form className={styles.form} action={continueWithGoogle}>
                <ActionButton type="submit">Continuar con Google</ActionButton>
              </form>

              {page.assurance ? <p className={styles.assurance}>{page.assurance}</p> : null}
              <p className={styles.legal}>{page.legal}</p>
            </div>

            {page.steps.length > 0 ? (
              <aside className={styles.steps} data-testid="entrar-pasos">
                <h2 className={styles.stepsTitle}>Qué pasa después</h2>
                <ol className={styles.stepList}>
                  {page.steps.map((step, index) => (
                    <li className={styles.step} key={step}>
                      {/* El número es la posición de la lista, no información
                          nueva: la lectura asistida ya la anuncia. */}
                      <span className={styles.stepNumber} aria-hidden="true">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                {page.aside ? <p className={styles.asideNote}>{page.aside}</p> : null}
              </aside>
            ) : null}
          </div>
        </Container>
      </main>
    </div>
  );
}
