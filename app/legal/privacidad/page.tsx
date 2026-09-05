import type { Metadata } from "next";
import { AppLink } from "@/../components/atoms/AppLink";
import { DraftNotice } from "../draft-notice";
import styles from "../legal.module.css";

/**
 * "Política de privacidad" (tasks.md 23.5) — borrador para ratificación del
 * fundador. Los datos recogidos son los que `google-profile.ts` y
 * `enlace.ts` realmente capturan; los encargados son los proveedores reales
 * del código (`resend-lifecycle-mailer.ts`, `r2-photo-storage.ts`, Neon).
 * La retención de `contact_reveal_event` queda pendiente a propósito —
 * design.md la nombra como pregunta abierta sin fecha.
 */
export const metadata: Metadata = {
  title: "Política de privacidad — Rentas",
  description: "Qué datos recoge rentas.com.ve, para qué los usa y con quién los comparte.",
};

export default function PrivacidadPage() {
  return (
    <article>
      <h1 className={styles.title}>Política de privacidad</h1>
      <DraftNotice />

      <h2 className={styles.heading}>Qué datos recogemos</h2>
      <ul className={styles.list}>
        <li className={styles.item}>
          Si entrás con Google: el nombre y el correo verificado que Google confirma. No se guarda
          ninguna foto de perfil ni ningún otro dato de tu cuenta de Google.
        </li>
        <li className={styles.item}>
          Si entrás con el enlace por correo: la dirección de correo a la que lo enviamos.
        </li>
        <li className={styles.item}>
          Al publicar un aviso: el método y el valor de contacto que elegís mostrar (WhatsApp,
          teléfono o correo), y los datos del inmueble.
        </li>
        <li className={styles.item}>
          Al contactar a un dueño: el mensaje que escribís antes de ver su contacto queda asociado a
          ese momento — qué aviso, cuándo, y tu cuenta.
        </li>
      </ul>

      <h2 className={styles.heading}>Para qué se usan</h2>
      <p className={styles.text}>
        Para identificarte al entrar, para publicar y mostrar tu aviso, y para que otra persona
        pueda contactarte. Nada de esto se usa con fines publicitarios: no vendemos tus datos ni
        armamos perfiles con ellos.
      </p>

      <h2 className={styles.heading}>Con quién se comparte</h2>
      <p className={styles.text}>
        Con <strong>Google</strong>, sólo para verificar tu identidad al entrar; con{" "}
        <strong>Resend</strong>, para enviarte el enlace de entrada y los avisos de vencimiento; y
        con <strong>Neon</strong> y <strong>Cloudflare</strong>, que alojan la base de datos y las
        fotos. Ninguno usa tus datos con fines propios: los procesan por nuestra cuenta, para que el
        sitio funcione.
      </p>

      <h2 className={styles.heading}>Cuánto tiempo se conservan</h2>
      <p className={styles.text}>
        Tus datos de cuenta se conservan mientras la cuenta exista. El tiempo de conservación del
        registro de a quién le revelaste un contacto todavía está en definición — este texto se
        actualizará en cuanto se decida.
      </p>

      <h2 className={styles.heading}>Tus derechos</h2>
      <p className={styles.text}>
        Hoy no existe una pantalla propia para corregir o borrar tus datos. Mientras tanto, escribí
        a <AppLink href="mailto:hola@rentas.com.ve">hola@rentas.com.ve</AppLink>.
      </p>

      <h2 className={styles.heading}>Cookies</h2>
      <p className={styles.text}>
        Qué cookies usamos está en <AppLink href="/legal/cookies">Uso de cookies</AppLink>.
      </p>
    </article>
  );
}
