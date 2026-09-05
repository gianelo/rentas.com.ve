import type { Metadata } from "next";
import { AppLink } from "@/../components/atoms/AppLink";
import styles from "../ayuda.module.css";

/**
 * "Preguntas frecuentes" (tasks.md 23.4) — the first of the three Ayuda
 * pages derivable from what the product already does, with no new product
 * decision behind it.
 *
 * Every answer here names a fact that already lives elsewhere in the
 * codebase — the thirty-day listing lifetime
 * (`listing-lifecycle/domain/expiry.ts`), the nine publish steps
 * (`app/publicar/step-copy.ts`), the two sign-in paths (Google and the
 * emailed link, `identity/infrastructure/auth.ts`), and the
 * keyed-with-a-message contact reveal (`components/molecules/ContactBlock.tsx`)
 * — never an invented policy.
 */
export const metadata: Metadata = {
  title: "Preguntas frecuentes — Rentas",
  description: "Cómo funciona rentas.com.ve: publicar, buscar y contactar, sin comisión.",
};

export default function PreguntasFrecuentesPage() {
  return (
    <article>
      <h1 className={styles.title}>Preguntas frecuentes</h1>

      <h2 className={styles.heading}>¿Cuánto cuesta publicar o contactar a un dueño?</h2>
      <p className={styles.text}>
        Nada. Publicar un aviso y contactar al dueño no cuestan nada: rentas.com.ve no cobra
        comisión ni a quien publica ni a quien alquila.
      </p>

      <h2 className={styles.heading}>¿Cuánto dura un aviso publicado?</h2>
      <p className={styles.text}>
        30 días. Antes de que venza, le avisamos por correo a quien lo publicó con un enlace para
        renovarlo. Si no se renueva, el aviso deja de mostrarse.
      </p>

      <h2 className={styles.heading}>¿Quién puede publicar un aviso?</h2>
      <p className={styles.text}>
        Un dueño o una inmobiliaria. Quién publica se indica al crear el aviso, y la ficha lo
        muestra.
      </p>

      <h2 className={styles.heading}>¿Cómo entro para publicar o para contactar a un dueño?</h2>
      <p className={styles.text}>
        Con una cuenta de Google o con un enlace que te llega por correo. No hace falta ninguna
        contraseña.
      </p>

      <h2 className={styles.heading}>¿Cómo contacto al dueño de un aviso?</h2>
      <p className={styles.text}>
        Cada ficha muestra un botón para ver el contacto del dueño. Hace falta entrar y escribir un
        mensaje antes de verlo — el detalle está en{" "}
        <AppLink href="/ayuda/como-contactar-al-dueno">Cómo contactar al dueño</AppLink>.
      </p>

      <h2 className={styles.heading}>¿rentas.com.ve interviene en el contrato o en el pago?</h2>
      <p className={styles.text}>
        No. rentas.com.ve no participa en la negociación entre las partes. Visitá la propiedad y
        verificá quién es el dueño antes de entregar dinero.
      </p>

      <h2 className={styles.heading}>¿Puedo editar mi aviso después de publicarlo?</h2>
      <p className={styles.text}>
        Sí, desde «Mis avisos», con la misma cuenta con la que publicaste.
      </p>

      <h2 className={styles.heading}>¿Cuántas fotos puedo subir?</h2>
      <p className={styles.text}>Entre 1 y 6 fotos por aviso.</p>
    </article>
  );
}
