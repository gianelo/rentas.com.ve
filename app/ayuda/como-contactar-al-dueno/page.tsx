import type { Metadata } from "next";
import styles from "../ayuda.module.css";

/**
 * "Cómo contactar al dueño" (tasks.md 23.4) — derived from the real contact
 * reveal, never from a generic "click to see the phone" description.
 *
 * Every claim here traces to real code: the contact stays masked and the
 * message field is required before revealing
 * (`components/molecules/ContactBlock.tsx`), signing in is enforced inside
 * `revealContact` before the catalogue is even touched
 * (`contact-reveal/application/reveal-contact.ts`), and the negotiation
 * warning is the exact sentence `ContactBlock` already shows next to every
 * revealed contact.
 */
export const metadata: Metadata = {
  title: "Cómo contactar al dueño — Rentas",
  description: "Cómo funciona el contacto con llave de rentas.com.ve, y por qué pide un mensaje.",
};

export default function ComoContactarPage() {
  return (
    <article>
      <h1 className={styles.title}>Cómo contactar al dueño</h1>

      <p className={styles.text}>
        Cada ficha muestra que el aviso tiene contacto, pero lo mantiene tapado hasta que hacés dos
        cosas: entrar con tu cuenta y escribir un mensaje.
      </p>

      <h2 className={styles.heading}>1. Entrás</h2>
      <p className={styles.text}>
        Con una cuenta de Google o con un enlace que te llega por correo. No hace falta ninguna
        contraseña, y si ya habías entrado antes no te lo vuelve a pedir.
      </p>

      <h2 className={styles.heading}>2. Escribís un mensaje</h2>
      <p className={styles.text}>
        Antes de ver el contacto, hay que escribirle un mensaje a quien publicó. No es un trámite:
        el mensaje viaja junto con el contacto que se revela, así que quien publica recibe algo de
        verdad y no un texto genérico.
      </p>

      <h2 className={styles.heading}>3. Ves el contacto y escribís por el canal que corresponda</h2>
      <p className={styles.text}>
        Según lo que haya dejado quien publicó, vas a poder escribirle por WhatsApp, llamarlo, o
        escribirle un correo, con tu mensaje ya cargado.
      </p>

      <h2 className={styles.heading}>Antes de acordar nada</h2>
      <p className={styles.text}>
        rentas.com.ve no participa en la negociación. Visitá la propiedad y verificá quién es el
        dueño antes de entregar dinero.
      </p>
    </article>
  );
}
