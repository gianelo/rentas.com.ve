import type { Metadata } from "next";
import { DraftNotice } from "../draft-notice";
import styles from "../legal.module.css";

/**
 * "Uso de cookies" (tasks.md 23.5) — borrador para ratificación del
 * fundador. Nombra las dos cookies que el repositorio escribe hoy — la de
 * sesión de Auth.js (nombre por defecto de `next-auth@5.0.0-beta.32`, sin
 * `cookies` propio en `auth.ts`) y `rentas_enlace` (`enlace.ts`, 15 min) —
 * y afirma la ausencia de cookies de publicidad o analítica porque una
 * búsqueda en todo el repositorio no encontró ninguna.
 */
export const metadata: Metadata = {
  title: "Uso de cookies — Rentas",
  description: "Las únicas dos cookies que rentas.com.ve usa, y para qué sirve cada una.",
};

export default function CookiesPage() {
  return (
    <article>
      <h1 className={styles.title}>Uso de cookies</h1>
      <DraftNotice />

      <p className={styles.text}>
        rentas.com.ve usa exactamente dos cookies, y las dos son necesarias para que el sitio
        funcione. Ninguna de las dos vende ni comparte información con anunciantes.
      </p>

      <h2 className={styles.heading}>Qué cookies usamos</h2>
      <ul className={styles.list}>
        <li className={styles.item}>
          <strong>Cookie de sesión</strong> (<code>authjs.session-token</code>, o su variante{" "}
          <code>__Secure-</code> cuando el sitio corre por HTTPS). La escribe Auth.js cuando entrás
          con Google o con el enlace por correo; es <code>httpOnly</code> y dura mientras tu sesión
          esté activa. Sin ella no podés publicar un aviso ni ver el contacto de un dueño.
        </li>
        <li className={styles.item}>
          <strong>Comprobante del enlace de entrada</strong> (<code>rentas_enlace</code>). Se
          escribe sólo cuando pedís que te enviemos un enlace por correo, es <code>httpOnly</code>,
          dura 15 minutos y sólo se lee en la pantalla de espera de <code>/signin</code>.
        </li>
      </ul>

      <h2 className={styles.heading}>Qué NO usamos</h2>
      <p className={styles.text}>
        No usamos cookies de publicidad, ni de rastreo de terceros, ni de analítica de
        comportamiento. No hay ningún script de ese tipo en el sitio.
      </p>

      <h2 className={styles.heading}>¿Podés navegar sin ellas?</h2>
      <p className={styles.text}>
        Sí. Buscar avisos y ver una ficha funcionan igual sin ninguna cookie. Lo único que necesita
        la cookie de sesión es entrar para publicar o para ver el contacto de un aviso.
      </p>
    </article>
  );
}
