import type { Metadata } from "next";
import { ActionButton } from "@/../components/atoms/buttons";
import { Field } from "@/../components/molecules/Field";
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_MESSAGE_MIN_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
} from "@/modules/site-contact/domain/contact-message";
import {
  CONTACT_ERROR_PARAM,
  CONTACT_SENT_PARAM,
  resolveContactScreen,
} from "@/modules/site-contact/domain/contact-screen";
import ayudaStyles from "../ayuda.module.css";
import { sendContactMessageAction } from "./actions";
import styles from "./escribinos.module.css";

/**
 * "Escribinos" (tasks.md 23.7, DECIDIDA 2026-09-04) — un FORMULARIO que
 * envía por Resend, no un `mailto:` ni una dirección publicada. El
 * argumento que lo decidió: no expone una dirección a los scrapers y
 * funciona para quien no tiene cliente de correo configurado.
 *
 * **Un POST nativo hacia una Server Action, sin una línea de JavaScript de
 * cliente** — la misma forma que el formulario de publicar y el de
 * reportar ya usan. La validación de HTML5 (`required`, `type="email"`,
 * `minLength`/`maxLength`) corre en el navegador SIN script: es una regla
 * declarativa, no un `<script>`. El servidor la vuelve a comprobar
 * (`sendContactMessage`, dominio) porque esa validación es la garantía;
 * la del navegador es sólo la cortesía de no hacer viajar un POST que va a
 * volver.
 */
export const metadata: Metadata = {
  title: "Escribinos — Rentas",
  description: "Escribinos un mensaje desde rentas.com.ve y te contestamos por correo.",
};

interface EscribinosProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EscribinosPage({ searchParams }: EscribinosProps) {
  const query = await searchParams;
  const screen = resolveContactScreen(query[CONTACT_SENT_PARAM], query[CONTACT_ERROR_PARAM]);

  return (
    <article>
      <h1 className={ayudaStyles.title}>Escribinos</h1>

      {screen.state === "sent" ? (
        <p className={ayudaStyles.text}>
          Recibimos tu mensaje. Te contestamos por correo, al mismo que dejaste acá.
        </p>
      ) : (
        <>
          <p className={ayudaStyles.text}>
            No publicamos ninguna dirección de correo acá: contanos qué necesitás y te escribimos
            nosotros a la tuya.
          </p>

          {screen.errorNotice ? (
            <p className={styles.errorBanner} role="alert">
              {screen.errorNotice}
            </p>
          ) : null}

          <form action={sendContactMessageAction} className={styles.form}>
            <Field name="name" label="Tu nombre" required>
              {(attrs) => (
                <input {...attrs} type="text" required maxLength={CONTACT_NAME_MAX_LENGTH} />
              )}
            </Field>

            <Field name="email" label="Tu correo" required>
              {(attrs) => <input {...attrs} type="email" required />}
            </Field>

            <Field name="message" label="Tu mensaje" required>
              {(attrs) => (
                <textarea
                  {...attrs}
                  rows={6}
                  required
                  minLength={CONTACT_MESSAGE_MIN_LENGTH}
                  maxLength={CONTACT_MESSAGE_MAX_LENGTH}
                />
              )}
            </Field>

            {/* La trampa (23.7 — "protección contra spam"). `aria-hidden` y
                `tabIndex={-1}` acá, `clip`/`overflow` en `escribinos.module.css`:
                ningún visitante real —con mouse, teclado o lector de
                pantalla— llega a este campo. Un script que completa cada
                campo que encuentra, sí. */}
            <p className={styles.trap} aria-hidden="true">
              <label htmlFor="sitioWeb">Dejá esto vacío</label>
              <input id="sitioWeb" name="sitioWeb" type="text" tabIndex={-1} autoComplete="off" />
            </p>

            <ActionButton type="submit">Enviar mensaje</ActionButton>
          </form>
        </>
      )}
    </article>
  );
}
