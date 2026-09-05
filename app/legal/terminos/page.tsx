import type { Metadata } from "next";
import { AppLink } from "@/../components/atoms/AppLink";
import { DraftNotice } from "../draft-notice";
import styles from "../legal.module.css";

/**
 * "Términos y condiciones" (tasks.md 23.5) — borrador para ratificación del
 * fundador. Cada regla nombrada ya existe en el código: `publishable-listing.ts`,
 * `listing-lifecycle/domain/expiry.ts`, `identity/infrastructure/auth.ts` y
 * `listing-trust/domain/report-threshold.ts`.
 */
export const metadata: Metadata = {
  title: "Términos y condiciones — Rentas",
  description: "Las reglas de uso de rentas.com.ve, tal como funciona hoy.",
};

export default function TerminosPage() {
  return (
    <article>
      <h1 className={styles.title}>Términos y condiciones</h1>
      <DraftNotice />

      <p className={styles.text}>
        rentas.com.ve es un sitio gratuito de avisos de alquiler en Venezuela: no cobra comisión ni
        a quien publica ni a quien alquila.
      </p>

      <h2 className={styles.heading}>Qué es rentas.com.ve y qué no es</h2>
      <p className={styles.text}>
        rentas.com.ve conecta a quien publica un aviso con quien lo busca, pero no participa en la
        negociación entre las partes, no es parte del contrato de alquiler y no verifica la
        identidad de quien publica más allá de lo que se describe en{" "}
        <AppLink href="/ayuda/como-contactar-al-dueno">Cómo contactar al dueño</AppLink>. Visitá la
        propiedad y verificá quién es el dueño antes de entregar dinero.
      </p>

      <h2 className={styles.heading}>Quién puede publicar</h2>
      <p className={styles.text}>
        Un dueño o una inmobiliaria. Quién publica se declara al crear el aviso, y esa declaración
        no se verifica más allá de lo que la persona indica.
      </p>

      <h2 className={styles.heading}>Cuentas</h2>
      <p className={styles.text}>
        Se entra con una cuenta de Google o con un enlace que llega por correo. No hace falta
        ninguna contraseña, y no existe otra forma de entrar.
      </p>

      <h2 className={styles.heading}>Duración de un aviso</h2>
      <p className={styles.text}>
        Un aviso publicado dura 30 días. Antes de que venza, se le avisa por correo a quien lo
        publicó con un enlace para renovarlo; si no se renueva, el aviso deja de mostrarse.
      </p>

      <h2 className={styles.heading}>Reglas de contenido, reportes y remoción</h2>
      <p className={styles.text}>
        Qué se puede publicar y qué no está en{" "}
        <AppLink href="/legal/normas">Normas de publicación</AppLink>. Cualquier cuenta puede
        reportar un aviso; cuando tres cuentas distintas lo reportan, se oculta automáticamente
        mientras se revisa.
      </p>

      <h2 className={styles.heading}>Ley aplicable</h2>
      <p className={styles.text}>
        Estos términos se rigen por las leyes de la República Bolivariana de Venezuela.
      </p>
    </article>
  );
}
