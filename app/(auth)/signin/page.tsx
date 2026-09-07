import type { Metadata } from "next";
import { AppLink } from "../../../components/atoms/AppLink";
import { ActionButton, NeutralButton } from "../../../components/atoms/buttons";
import { GoogleMark } from "../../../components/atoms/icons";
import { Label } from "../../../components/atoms/Label";
import { Container } from "../../../components/layout/Container";
import {
  EMAIL_ERROR_TOKEN,
  signInPageFor,
} from "../../../src/modules/identity/domain/sign-in-page";
import { signIn } from "../../../src/modules/identity/infrastructure/auth";
import { requestMagicLink } from "./actions";
import { DoorBar } from "./DoorBar";
import styles from "./signin.module.css";

export const metadata: Metadata = {
  title: "Entrar — Rentoru",
  // 26.12 — relativa: `metadataBase` le pone la base una sola vez.
  alternates: { canonical: "/signin" },
};

interface SignInPageProps {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    /**
     * tasks.md 22.29 — la bandera del correo rechazado, nunca la dirección.
     * El nombre literal es `EMAIL_ERROR_QUERY_NAME`: un tipo no puede tomar
     * la clave de una constante, así que queda escrito acá y comprobado por
     * `entrar-servida.test.tsx` contra los bytes que la ruta sirve de
     * verdad.
     */
    correo?: string | string[];
  }>;
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
  const { callbackUrl, correo } = await searchParams;
  // tasks.md 22.29 — un único valor válido, igual que `DOOR_OPEN_TOKEN`:
  // cualquier otra cosa (ausente, repetido, mal escrito) deja el campo sin
  // marcar. La dirección tecleada nunca llega hasta acá: la acción sólo
  // manda el booleano.
  const page = signInPageFor(callbackUrl, { emailRejected: correo === EMAIL_ERROR_TOKEN });
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
                {/* Nivel 3 y con la marca (tasks.md 22.20): con el disco de
                    Google puesto, un relleno --accent competiría con la marca,
                    y el borde sin relleno es el que Google exige. */}
                <NeutralButton type="submit">
                  <GoogleMark />
                  Continuar con Google
                </NeutralButton>
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
                    className={
                      page.emailError ? `${styles.field} ${styles.fieldInvalid}` : styles.field
                    }
                    id="correo"
                    name="correo"
                    placeholder={page.email.placeholder}
                    required
                    type="email"
                    // SISTEMA.md §225: el campo en error se anuncia, no sólo se
                    // dibuja (misma regla que ya cumple `Field.tsx`). Ninguna
                    // de las dos entra sin `page.emailError`, así que un campo
                    // válido no lleva ninguna de las dos.
                    {...(page.emailError
                      ? { "aria-invalid": "true" as const, "aria-describedby": "correo-error" }
                      : {})}
                  />
                  <ActionButton type="submit">{page.email.submit}</ActionButton>
                </div>
                {/* **El error va antes de la ayuda** (SISTEMA.md §225, misma
                    regla que `Field.tsx`): la falla no puede ser la primera
                    vez que alguien se entera de la regla que rompió. */}
                {page.emailError ? (
                  <p className={styles.emailError} id="correo-error">
                    {page.emailError}
                  </p>
                ) : null}
                <p className={styles.emailNote}>{page.email.note}</p>
              </form>

              {page.assurance ? <p className={styles.assurance}>{page.assurance}</p> : null}
              {/* Cada fragmento ya viene decidido por `signInPageFor` (22.24):
                  acá sólo se elige entre un `<span>` y un enlace real, nunca
                  qué palabra enlaza a qué ruta. */}
              <p className={styles.legal}>
                {page.legal.map((fragment) =>
                  fragment.kind === "link" ? (
                    <AppLink key={fragment.href} href={fragment.href}>
                      {fragment.label}
                    </AppLink>
                  ) : (
                    <span key={fragment.value}>{fragment.value}</span>
                  ),
                )}
              </p>
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
