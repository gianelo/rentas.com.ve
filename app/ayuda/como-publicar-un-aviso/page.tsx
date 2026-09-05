import type { Metadata } from "next";
import styles from "../ayuda.module.css";

/**
 * "Cómo publicar un aviso" (tasks.md 23.4) — the nine real publish steps,
 * in the exact order and wording `app/publicar/step-copy.ts` uses, never a
 * rewrite from memory. The listing lifetime (30 days) reuses the same fact
 * `listing-lifecycle/domain/expiry.ts` names, and the sign-in step names
 * the same two real paths `identity/infrastructure/auth.ts` offers.
 */
export const metadata: Metadata = {
  title: "Cómo publicar un aviso — Rentas",
  description: "Los nueve pasos para publicar un aviso en rentas.com.ve, sin comisión.",
};

interface Step {
  readonly label: string;
  readonly text: string;
}

const STEPS: readonly Step[] = [
  {
    label: "Tipo",
    text: "Elegís qué vas a alquilar: apartamento, casa, quinta, anexo o habitación.",
  },
  { label: "Zona", text: "Buscás la zona donde queda. La ciudad la determina la zona." },
  { label: "Precio", text: "Ponés cuánto pedís al mes, en dólares." },
  {
    label: "Tamaño",
    text: "Habitaciones, baños, metros cuadrados y puestos de estacionamiento.",
  },
  {
    label: "Qué tiene",
    text: "Marcás lo que tenga: planta eléctrica, agua regular, amoblado, vigilancia 24 h, línea blanca.",
  },
  { label: "Título", text: "Le ponés un título. Es lo primero que se lee en la lista." },
  { label: "Descripción", text: "Contás lo que no se ve en las fotos, hasta 1.200 caracteres." },
  { label: "Fotos", text: "Subís entre 1 y 6 fotos." },
  {
    label: "Quién publica",
    text: "Decís si publicás como dueño o como inmobiliaria, y dejás un contacto.",
  },
];

export default function ComoPublicarPage() {
  return (
    <article>
      <h1 className={styles.title}>Cómo publicar un aviso</h1>

      <p className={styles.text}>
        Publicar es gratis y son nueve pasos cortos. Hace falta entrar con una cuenta de Google o
        con un enlace que llega por correo — no hace falta ninguna contraseña.
      </p>

      <ol className={styles.list}>
        {STEPS.map((step, index) => (
          <li className={styles.item} key={step.label}>
            <strong>
              {index + 1}. {step.label}.
            </strong>{" "}
            {step.text}
          </li>
        ))}
      </ol>

      <h2 className={styles.heading}>Después de publicar</h2>
      <p className={styles.text}>
        El aviso queda activo 30 días. Antes de que venza, te avisamos por correo con un enlace para
        renovarlo, y podés editarlo en cualquier momento desde «Mis avisos».
      </p>
    </article>
  );
}
