import type {
  ContactMethod,
  ContactPresentation,
} from "@/modules/contact-reveal/domain/revealable-contact";
import {
  contactActionHref,
  contactChannelNoun,
} from "@/modules/contact-reveal/domain/revealable-contact";
import { ActionButton, ActionLink } from "../atoms/buttons";
import { CopyContact } from "../client/CopyContact";
import styles from "./ContactBlock.module.css";
import { Field } from "./Field";

export interface ContactBlockProps {
  readonly contact: ContactPresentation;
  readonly publisherType: "owner" | "broker";
  readonly publisherName: string | null;
  /** Viaja en el formulario: la acción es un endpoint HTTP como cualquier otro. */
  readonly listingId: string;
  /** Para el mensaje redactado — quien publica tiene que saber por cuál aviso le escriben. */
  readonly listingTitle: string;
  /** A dónde va la acción cuando hay que entrar: esta misma ficha con la puerta
   * abierta (15.8). Se llamaba `signInHref` y apuntaba a `/signin` — justo
   * sacar al inquilino del aviso que estaba leyendo. */
  readonly doorHref: string;
  /** La revelación, que es un caso de uso y no un enlace. */
  readonly revealAction: (formData: FormData) => Promise<void>;
  /** `null` mientras no exista `phone_verified_at` (tasks.md 16.12). */
  readonly verifiedAt: Date | null;
  readonly expiresAt: Date;
  readonly zoneName: string;
  readonly zoneHref: string;
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
function lockedLabel(method: ContactMethod, publisherType: "owner" | "broker") {
  const owner = publisherType === "owner" ? "del dueño" : "de la inmobiliaria";
  return `Ver ${contactChannelNoun(method)} ${owner}`;
}

/**
 * El verbo de cada acción, que **no** es el sustantivo del canal.
 *
 * A un teléfono se lo llama y a un correo se le escribe: una sola plantilla
 * ("Escribir por ___") produciría "Escribir por teléfono", que nombra el canal
 * correcto y promete la acción equivocada. Un `Record` para que un cuarto
 * método rompa la compilación en vez de caer en un verbo por defecto.
 */
const REVEALED_LABEL: Record<ContactMethod, (noun: string) => string> = {
  whatsapp: (noun) => `Escribir por ${noun}`,
  telefono: () => "Llamar",
  email: () => "Escribir un correo",
};

/** "19 ago." — la misma escala corta que el pie de la ficha usa para el vencimiento. */
function shortDate(date: Date): string {
  return new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short" }).format(date);
}

/** "12 de septiembre" — el estado vencido dice la fecha entera, no una abreviatura. */
function longDate(date: Date): string {
  return new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long" }).format(date);
}

/**
 * Redacción sugerida, en dos lugares con papeles distintos.
 *
 * **En el textarea es `placeholder`, NUNCA `defaultValue`** — guía sin
 * escribir por el inquilino. Precargarla cumpliría la spec al pie de la letra
 * y vaciaría su motivo: `design.md` descartó el modelo de bid argumentando
 * que "bulk harvesting now costs a message per listing instead of a click",
 * y un campo que ya viene lleno deja el revelado costando exactamente un
 * clic. La barrera es que haya que escribir algo, aunque sean cuatro
 * palabras; y de paso quien publica recibe un mensaje de verdad y no la
 * plantilla que ya leyó cuarenta veces.
 *
 * En el enlace revelado sí es el respaldo (tasks.md 6.14), para cuando este
 * render no conoce el mensaje guardado — una revelación anterior a la
 * migración lo tiene en `NULL`. Ahí nunca deja el `wa.me` sin texto.
 */
function defaultRevealMessage(listingTitle: string): string {
  return `Hola, vi tu aviso «${listingTitle}» en rentas.com.ve y me interesa.`;
}

/**
 * El bloque de contacto con llave (F29, F30), en sus **tres** estados.
 *
 * **Nunca se oculta entero.** Tiene que verse que el teléfono existe y qué
 * falta para verlo: un bloque ausente se lee como un aviso incompleto, y quien
 * lo mira se va sin saber que había un contacto a un toque de distancia.
 *
 * **Cuál de los tres estados se dibuja no se decide acá.** Llega resuelto en
 * `contact`, desde `presentListingContact` — este componente no puede
 * equivocarse de estado porque no tiene con qué: el estado bloqueado ni
 * siquiera lleva el valor encima.
 */
export function ContactBlock({
  contact,
  publisherType,
  publisherName,
  listingId,
  listingTitle,
  doorHref,
  revealAction,
  verifiedAt,
  expiresAt,
  zoneName,
  zoneHref,
}: ContactBlockProps) {
  // El aviso vencido no lleva publicador, ni máscara, ni advertencia de
  // negociación: no hay negociación que advertir. Lo que sí lleva es una
  // salida, porque quien llegó buscando en esta zona sigue buscando en esta
  // zona (nota del diseño, lámina 10c).
  if (contact.state === "expired") {
    return (
      <section className={styles.block} data-testid="contact-block">
        <div className={styles.expired} data-testid="expired-notice">
          <h2 className={styles.expiredTitle}>Aviso vencido</h2>
          <p className={styles.expiredText}>
            Venció el {longDate(expiresAt)} y no fue renovado. No mostramos el contacto de avisos
            vencidos.
          </p>
        </div>
        <div className={styles.control}>
          <ActionLink href={zoneHref}>Ver avisos activos en {zoneName}</ActionLink>
        </div>
      </section>
    );
  }

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
            {/* **Un formulario y no un enlace, que era el agujero.** El botón
                iba a `/signin` y no llamaba a nada: se podía entrar, volver a
                la ficha, y el número seguía tapado. Un enlace no ejecuta la
                revelación — y la revelación es el hecho que la métrica norte
                del producto cuenta. Sigue andando sin JavaScript: es un POST
                nativo, como el formulario de publicar. */}
            <form className={styles.control} action={revealAction}>
              <input type="hidden" name="listingId" value={listingId} />
              {/* La ficha es la única que conoce su URL canónica; la acción la
                  usa sólo si hace falta abrir la puerta (F19, 15.8). */}
              <input type="hidden" name="doorHref" value={doorHref} />
              {/* La revelación ahora cuesta un mensaje escrito (tasks.md
                  6.11-6.13): se pide ACÁ, antes de mostrar el contacto, y no
                  después. `required` es el respaldo del navegador sin
                  JavaScript; `revealContact` lo exige igual del lado del
                  servidor si alguien lo salta.

                  El campo arranca VACÍO y la redacción sugerida viaja como
                  `placeholder`: un `defaultValue` enviaría el mensaje por el
                  inquilino y dejaría el revelado costando un clic, que es
                  justo el costo que este campo existe para cobrar. El
                  `defaultValue` vacío sale del propio `Field`. */}
              <Field name="message" label="Tu mensaje para quien publica" required>
                {(attrs) => (
                  <textarea
                    {...attrs}
                    rows={3}
                    required
                    placeholder={defaultRevealMessage(listingTitle)}
                  />
                )}
              </Field>
              <ActionButton type="submit">
                {lockedLabel(contact.method, publisherType)}
              </ActionButton>
            </form>
          </>
        ) : (
          <>
            {/* Sólo si se sabe. `phone_verified_at` no existe todavía
                (tasks.md 16.12) y la verificación por WhatsApp es un stub, así
                que con `null` la línea no se dibuja: certificar un número que
                nadie comprobó sería peor que no decir nada. Dice CUÁNDO y no
                "vigente" — un aviso puede publicarse el último día de una
                verificación, y los dos relojes se cruzan (tasks.md 19.12). */}
            {verifiedAt ? (
              <p className={styles.verified}>
                Verificado por {contactChannelNoun(contact.method)} el {shortDate(verifiedAt)}
              </p>
            ) : null}

            <div className={styles.control}>
              <ActionLink
                href={contactActionHref(
                  contact.method,
                  contact.value,
                  // El mensaje del propio inquilino (tasks.md 6.14), cuando
                  // este render lo conoce; si no, el mismo texto que antes
                  // era fijo pasa a ser sólo el respaldo.
                  contact.message ?? defaultRevealMessage(listingTitle),
                )}
              >
                {REVEALED_LABEL[contact.method](contactChannelNoun(contact.method))}
              </ActionLink>
            </div>

            <div className={styles.copy}>
              <CopyContact
                value={contact.value}
                label={`Copiar el ${contactChannelNoun(contact.method)}`}
              />
            </div>
          </>
        )}
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
