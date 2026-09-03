import type { ContactMethod, ContactPresentation } from "./revealable-contact";
import { contactChannelNoun } from "./revealable-contact";

/**
 * La puerta que pide la cuenta **sin sacar al inquilino del aviso** (F19/F20,
 * tasks.md 15.8, láminas 8b y 9b).
 *
 * **Es un estado de la ficha que decide la dirección**, igual que el panel de
 * filtros (`resolveFilterPanel`/`PANEL_OPEN_TOKEN`), y por lo que `AGENTS.md`
 * §2 obliga: una hoja que sólo existe adentro de un componente de cliente deja
 * afuera a quien no recibió el paquete — y el navegador de WhatsApp, de donde
 * llegan estos enlaces, es justo donde no llega. Qué dice y cuándo aparece es
 * producto, y el suelo del 90 % llega a `src/modules/`, no a `app/`.
 */

/** El parámetro que la abre. La ficha lo lee; no lo inventa. */
export const DOOR_QUERY_NAME = "entrar";

/** Su único valor válido. Cualquier otro deja la puerta cerrada. */
export const DOOR_OPEN_TOKEN = "si";

export interface ContactDoorCopy {
  readonly title: string;
  readonly reason: string;
  /** La salida visible: mirar el aviso nunca costó una cuenta. */
  readonly stayLabel: string;
  readonly closeLabel: string;
  readonly assurance: string;
}

export interface DoorPublisher {
  readonly type: "owner" | "broker";
  readonly name: string | null;
}

/** La frase entera: armar la preposición afuera da «de el dueño». */
function publisherPhrase({ type, name }: DoorPublisher): string {
  if (name !== null && name.trim() !== "") return `de ${name}`;

  return type === "owner" ? "del dueño" : "de la inmobiliaria";
}

/**
 * La puerta, o `null` cuando no hay puerta que dibujar. **Las dos condiciones
 * van juntas a propósito**: el token lo escribe cualquiera, y sobre un contacto
 * ya revelado o un aviso vencido la puerta sería un muro delante de algo
 * abierto. Separarlas dejaría a la pantalla decidiendo la segunda.
 */
export function contactDoorFor(
  contact: ContactPresentation,
  publisher: DoorPublisher,
  raw: string | readonly string[] | undefined,
): ContactDoorCopy | null {
  if (raw !== DOOR_OPEN_TOKEN) return null;
  if (contact.state !== "locked") return null;

  const noun = contactChannelNoun(contact.method);

  return {
    title: `Entrá para ver el ${noun} ${publisherPhrase(publisher)}`,
    reason: "Pedimos la cuenta para frenar avisos falsos. Es gratis y es un toque.",
    stayLabel: "Seguir mirando sin entrar",
    closeLabel: "Cerrar sin entrar",
    assurance: "Volvés a este mismo aviso al terminar.",
  };
}

/**
 * **Lo que se lee al lado del número tapado** (F20, tasks.md 15.11, láminas
 * Ficha 8b/9b y el bloque de contacto de la ficha).
 *
 * F20 no es «hay una salida» a secas: es *«entrar no es un muro: el contenido
 * del aviso es público y solo el teléfono está detrás de la cuenta»*. La
 * salida la dibujan las tres puertas; **esta frase es la otra mitad** — la que
 * dice QUÉ falta y POR QUÉ, justo donde falta.
 *
 * **Vive acá y no en `ContactBlock`, que es de donde se la trajo.** Estaba
 * escrita a mano adentro del componente: una razón de producto en un sitio al
 * que el suelo del 90 % no llega, y sin una sola prueba que la nombrara. La
 * misma afirmación que `contactDoorFor` ya decía desde el dominio, escrita dos
 * veces en dos capas distintas.
 *
 * **Dos frases y no una, porque las láminas dibujan dos.** La puerta la dice
 * entera y con punto; el bloque la encadena con dos puntos a qué falta para
 * ver el número. Se conservan las dos como están dibujadas: unificarlas sería
 * inventar una tercera. Lo que NO puede pasar es que se separen, y de eso se
 * encarga la prueba que las pinea por valor.
 */
export function lockedContactNotice(method: ContactMethod): string {
  return (
    `Mostramos el ${contactChannelNoun(method)} a usuarios registrados. ` +
    "Pedimos la cuenta para frenar avisos falsos: es gratis y es un toque."
  );
}

/**
 * La dirección que abre la puerta sobre esta misma ficha. Acá y no en la
 * pantalla porque armar la consulta a mano es donde nace el `?` que debía ser
 * `&`: no rompe nada visible, se lleva puesto el origen de búsqueda (16.9) y
 * nadie se entera hasta que alguien vuelve al lugar equivocado.
 */
export function doorHrefFor(listingHref: string): string {
  const [path, query] = listingHref.split("?");
  const params = new URLSearchParams(query);
  params.set(DOOR_QUERY_NAME, DOOR_OPEN_TOKEN);

  return `${path}?${params}`;
}
