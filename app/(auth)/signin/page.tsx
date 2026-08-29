import type { Metadata } from "next";
import { ActionButton } from "../../../components/atoms/buttons";
import { Label } from "../../../components/atoms/Label";
import { Container } from "../../../components/layout/Container";
import { signInPageFor } from "../../../src/modules/identity/domain/sign-in-page";
import { signIn } from "../../../src/modules/identity/infrastructure/auth";
import { requestMagicLink } from "./actions";
import { DoorBar } from "./DoorBar";
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
      <DoorBar wayOut={page.wayOut} />

      <main>
        <Container>
          <div className={styles.grid}>
            <div data-testid="entrar-columna">
              <h1 className={styles.title}>{page.title}</h1>
              <p className={styles.reason}>{page.reason}</p>

              <form className={styles.form} action={continueWithGoogle}>
                <ActionButton type="submit">Continuar con Google</ActionButton>
              </form>

              {/* La segunda puerta (22.22). Google arriba y el correo debajo,
                  que es la nota de la lámina: un toque le gana a escribir una
                  dirección en un teclado de teléfono. */}
              <p className={styles.separator}>
                <span>{page.email.separator}</span>
              </p>

              <form className={styles.emailForm} action={requestMagicLink}>
                {/* El destino cruza los dos formularios. Ya pasó por
                    `safeSignInReturn`, y la acción lo vuelve a juzgar: son dos
                    momentos, no dos reglas. */}
                <input type="hidden" name="callbackUrl" value={returnTo ?? ""} />
                <Label htmlFor="correo">{page.email.label}</Label>
                <div className={styles.emailRow}>
                  <input
                    autoComplete="email"
                    className={styles.field}
                    id="correo"
                    name="correo"
                    placeholder={page.email.placeholder}
                    required
                    type="email"
                  />
                  <ActionButton type="submit">{page.email.submit}</ActionButton>
                </div>
                <p className={styles.emailNote}>{page.email.note}</p>
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
