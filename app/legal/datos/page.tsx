import type { Metadata } from "next";
import { AppLink } from "@/../components/atoms/AppLink";
import { DraftNotice } from "../draft-notice";
import styles from "../legal.module.css";

/**
 * "Tratamiento de datos" (tasks.md 23.5) — borrador para ratificación del
 * fundador. Distinto de `/legal/privacidad`: ésta es el inventario dato por
 * dato, incluido el registro real de una revelación de contacto
 * (`contact_reveal_event` en schema.ts).
 */
export const metadata: Metadata = {
  title: "Tratamiento de datos — Rentas",
  description: "Qué datos personales procesa rentas.com.ve, dato por dato.",
};

export default function DatosPage() {
  return (
    <article>
      <h1 className={styles.title}>Tratamiento de datos</h1>
      <DraftNotice />

      <p className={styles.text}>
        Este texto detalla, dato por dato, qué guardamos sobre vos y para qué.{" "}
        <AppLink href="/legal/privacidad">Política de privacidad</AppLink> explica el marco general;
        acá está el inventario.
      </p>

      <h2 className={styles.heading}>Datos que procesamos</h2>
      <ul className={styles.list}>
        <li className={styles.item}>
          <strong>Nombre y correo</strong> — de tu cuenta de Google o de la dirección a la que te
          enviamos el enlace de entrada. Sirve para identificar tu cuenta.
        </li>
        <li className={styles.item}>
          <strong>Método y valor de contacto</strong> — el que elegís mostrar al publicar. Sirve
          para que quien vea tu aviso pueda escribirte.
        </li>
        <li className={styles.item}>
          <strong>Registro de contacto revelado</strong> — cuando alguien ve tu contacto, se guarda
          qué aviso, quién lo vio, cuándo, y el mensaje que esa persona escribió antes de verlo.
        </li>
      </ul>

      <h2 className={styles.heading}>Encargados del tratamiento</h2>
      <p className={styles.text}>
        <strong>Google</strong> procesa tu identidad sólo para verificarla al entrar.{" "}
        <strong>Resend</strong> procesa tu correo sólo para enviarte mensajes del sitio.{" "}
        <strong>Neon</strong> aloja la base de datos y <strong>Cloudflare</strong> aloja las fotos;
        ninguno de los cuatro usa tus datos para nada propio.
      </p>

      <h2 className={styles.heading}>Lo que no hacemos, y a quién escribirle</h2>
      <p className={styles.text}>
        Igual que en la política general: no vendemos tus datos, no armamos perfiles publicitarios
        con ellos y no compartimos tu contacto con nadie fuera de quien vos elegís que lo vea. Para
        cualquier pregunta sobre este tratamiento, escribí a{" "}
        <AppLink href="mailto:hola@rentas.com.ve">hola@rentas.com.ve</AppLink>.
      </p>
    </article>
  );
}
