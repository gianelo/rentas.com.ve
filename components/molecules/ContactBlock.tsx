import type { ContactPresentation } from "@/modules/contact-reveal/domain/revealable-contact";
import { contactChannelNoun } from "@/modules/contact-reveal/domain/revealable-contact";
import { ActionLink } from "../atoms/buttons";
import styles from "./ContactBlock.module.css";

export interface ContactBlockProps {
  readonly contact: ContactPresentation;
  readonly publisherType: "owner" | "broker";
  readonly publisherName: string | null;
  /** A dónde va el botón cuando hay que entrar. Lleva la vuelta a esta ficha. */
  readonly signInHref: string;
}

/**
 * Máscaras **fijas**, dibujadas sin mirar el valor guardado.
 *
 * Ahí está la garantía completa: como la cadena es literal, **no se filtra ni
 * un carácter**, y al mismo tiempo se cumple lo que la F29 pide — que el número
 * siempre se vea que existe. Las dos cosas, sin ceder ninguna.
 *
 * `+58` lo cumplen todos los teléfonos venezolanos, así que no identifica a
 * nadie.
 */
const MASKS = {
  whatsapp: "+58 ••• ••• ••••",
  telefono: "+58 ••• ••• ••••",
  email: "•••••@•••••.•••",
} as const;

/** El sustantivo sale del dominio; la frase se arma acá. */
function actionLabel(method: ContactPresentation["method"], publisherType: "owner" | "broker") {
  const owner = publisherType === "owner" ? "del dueño" : "de la inmobiliaria";
  return `Ver ${contactChannelNoun(method)} ${owner}`;
}

/**
 * El bloque de contacto con llave (F29, F30).
 *
 * **Nunca se oculta entero.** Tiene que verse que el teléfono existe y qué
 * falta para verlo: un bloque ausente se lee como un aviso incompleto, y quien
 * lo mira se va sin saber que había un contacto a un toque de distancia.
 */
export function ContactBlock({
  contact,
  publisherType,
  publisherName,
  signInHref,
}: ContactBlockProps) {
  return (
    <section className={styles.block} data-testid="contact-block">
      {publisherName ? (
        <p className={styles.publisher}>
          <span className={styles.name}>{publisherName}</span>
          <span className={styles.role}>
            publica como {publisherType === "owner" ? "dueño" : "inmobiliaria"}
          </span>
        </p>
      ) : null}

      <div className={styles.contact}>
        <p className={styles.value} data-testid="contact-value">
          {contact.state === "revealed" ? contact.value : MASKS[contact.method]}
        </p>

        {contact.state === "locked" ? (
          <>
            <p className={styles.why}>
              Mostramos el {contactChannelNoun(contact.method)} a usuarios registrados. Pedimos la
              cuenta para frenar avisos falsos: es gratis y es un toque.
            </p>
            <ActionLink href={signInHref}>{actionLabel(contact.method, publisherType)}</ActionLink>
          </>
        ) : null}
      </div>

      {/* Acompaña al contacto y no va al pie (F30): quien está por escribir es
          quien tiene que leerla, no quien ya se fue de la página. */}
      <p className={styles.warning}>
        Rentas no participa en la negociación. Visitá la propiedad y verificá quién es el dueño
        antes de entregar dinero.
      </p>
    </section>
  );
}
