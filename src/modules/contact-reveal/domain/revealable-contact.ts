/**
 * contact-reveal spec, Requirement: Contact Hidden from Anonymous Visitors.
 *
 * The rule is one line of logic; what this file is actually for is the shape
 * of its result. `locked` has **no `value` property at all** rather than a
 * masked or empty one, so a render, a JSON response, or a server-component
 * payload physically cannot carry the contact to a visitor who has not
 * revealed it. A `{ value, visible: false }` shape would leak on the first
 * component that forgot to check the flag — and that leak is silent.
 *
 * Stated at its real strength: this makes the value *unrepresentable* in the
 * locked branch, it does not stop a caller from lying about `hasRevealed`.
 * Who has revealed what is decided by the reveal use case reading the event
 * log, never by the page.
 */

/**
 * How the publisher wants to be reached. Declared here rather than imported
 * from listing-publication or from the Drizzle schema, following this
 * codebase's existing convention for `PublisherType`: a domain states the
 * unions it reasons about, so the layer stays free of both another module's
 * domain and the ORM. The three sets are kept identical by the compiler at
 * every boundary that carries a value between them.
 */
export type ContactMethod = "whatsapp" | "telefono" | "email";

/**
 * The stored contact, as `listing.contact_method` / `listing.contact_value`
 * actually hold it (founder, 2026-08-18: "el valor que quiera mostrar la
 * persona. Sea email, WhatsApp o número de teléfono").
 */
export interface PublisherContact {
  readonly method: ContactMethod;
  readonly value: string;
}

/**
 * **The method survives the locked branch, the value does not.** That
 * asymmetry is the whole point of this type. `publishable-listing.ts` records
 * the rule it serves: "the reveal button's label comes from this, so a listing
 * that says 'Ver WhatsApp' while holding an address is a promise the product
 * does not keep." The label is drawn in the LOCKED state — before anyone has
 * revealed anything — so a shape that carried the method only once revealed
 * would guarantee the wrong word exactly where it is read most.
 *
 * The method is not sensitive: knowing an advert is contacted by email tells a
 * visitor nothing the "Ver email del dueño" button was not going to tell them
 * anyway. The value is, and it stays absent.
 */
export type ContactPresentation =
  | { readonly state: "expired" }
  | { readonly state: "locked"; readonly method: ContactMethod }
  | { readonly state: "revealed"; readonly method: ContactMethod; readonly value: string };

/**
 * Lo que el ciclo de vida del aviso permite hacer con su contacto, dicho en
 * los términos de ESTA decisión y no en los de `listing.status`.
 *
 * Los cuatro estados del aviso (`draft`, `active`, `expired`, `hidden`) no
 * llegan hasta acá a propósito: tres de ellos no tienen contacto que mostrar
 * por razones distintas — el borrador nunca se publicó, el oculto lo quitó la
 * moderación y esos dos ni siquiera se sirven — y sólo el vencido es una
 * pantalla dibujada, con su fecha y su salida. Traer el `status` entero
 * obligaría a este dominio a conocer un ciclo de vida que pertenece a otro
 * módulo, y a decidir de nuevo en cada rama lo que la ficha ya decidió al
 * no encontrar el aviso.
 */
export type ContactAvailability = "available" | "expired";

/**
 * `null` is the anonymous visitor. A signed-in viewer is only ever described
 * by what this decision needs — whether this pair has a reveal event — so the
 * domain stays free of any session type owned by another module.
 */
export interface ContactViewer {
  readonly hasRevealed: boolean;
}

export function presentContact(
  contact: PublisherContact,
  viewer: ContactViewer | null,
): ContactPresentation {
  if (!viewer?.hasRevealed) {
    return { state: "locked", method: contact.method };
  }

  return { state: "revealed", method: contact.method, value: contact.value };
}

/**
 * Lo mismo, pero para la ficha: los TRES estados que el bloque de contacto
 * dibuja, decididos acá y no en el componente.
 *
 * **`value` acepta `null` porque no leerlo es el camino normal.** Quien llega
 * de Google no tiene sesión, y la ficha no le pide el valor a Postgres — así
 * que "todavía no lo leí" tiene que ser un estado representable, o el que
 * llame termina inventando un `""` que después hay que distinguir de un
 * contacto vacío de verdad.
 *
 * **El vencido se resuelve antes que el lector, y ése es el orden que
 * importa.** Escrito al revés, un inquilino con sesión que ya reveló seguiría
 * viendo el número de un aviso que ya no está en pie.
 */
export function presentListingContact(
  listing: {
    readonly method: ContactMethod;
    readonly availability: ContactAvailability;
    readonly value: string | null;
  },
  viewer: ContactViewer | null,
): ContactPresentation {
  if (listing.availability === "expired") {
    return { state: "expired" };
  }

  if (listing.value === null) {
    return { state: "locked", method: listing.method };
  }

  return presentContact({ method: listing.method, value: listing.value }, viewer);
}

/**
 * The channel's name, and only that: "Ver ___ del dueño" (SISTEMA.md screen 2)
 * is composed by whichever component draws the block.
 *
 * **The split is deliberate.** The sentence is copy and is being redesigned;
 * the rule that the word must name the channel actually stored is not, and it
 * belongs where the coverage floor can hold it. A `Record` rather than a
 * `switch` so adding a fourth method fails to compile here instead of falling
 * through to a default that quietly says the wrong thing.
 */
const CHANNEL_NOUN: Record<ContactMethod, string> = {
  whatsapp: "WhatsApp",
  telefono: "teléfono",
  email: "email",
};

export function contactChannelNoun(method: ContactMethod): string {
  return CHANNEL_NOUN[method];
}

/**
 * Venezuela en formato internacional, sin `+` — que es lo único que `wa.me`
 * entiende.
 *
 * **El formulario acepta el número como lo escribe una persona** y guarda esa
 * forma tal cual: `0412 123 4567`, `+58 412 1234567`, `04121234567`
 * (publishable-listing.test.ts los prueba los cuatro). Ninguna sirve para
 * abrir un chat. El defecto que esto evita no falla en ningún lado: WhatsApp
 * abre igual, con un número que no existe, y la conversación que el producto
 * existe para provocar simplemente no ocurre.
 */
function internationalDigits(value: string): string {
  const digits = value.replace(/\D/g, "");

  // El 0 es el prefijo nacional venezolano y se reemplaza por el país; un
  // número que ya viene con 58 se deja como está.
  if (digits.startsWith("58")) return digits;
  if (digits.startsWith("0")) return `58${digits.slice(1)}`;
  return `58${digits}`;
}

/**
 * **La acción sale del método, nunca de un `if` escrito en el componente.**
 *
 * Un `Record` y no un `switch` con `default`, por la misma razón que
 * `CHANNEL_NOUN`: un cuarto método tiene que romper la compilación acá en vez
 * de caer en una rama que abre la aplicación equivocada. El fundador listó
 * cuatro casos (fijo, celular con WhatsApp, celular sin WhatsApp, correo) y
 * colapsan a estas tres acciones — un celular sin WhatsApp y un fijo se
 * marcan igual (tasks.md 16.11).
 *
 * `message` llega armado desde afuera: la FRASE es copia y se redacta donde se
 * dibuja, igual que el sustantivo del canal. Lo que se decide acá es a dónde
 * va y cómo se codifica.
 */
const CONTACT_ACTION: Record<ContactMethod, (value: string, message: string) => string> = {
  whatsapp: (value, message) =>
    `https://wa.me/${internationalDigits(value)}?text=${encodeURIComponent(message)}`,
  // Con `+` y sin espacios: es lo que un marcador acepta sin adivinar el país.
  telefono: (value) => `tel:+${internationalDigits(value)}`,
  // El asunto y no el cuerpo: es lo que un cliente de correo muestra en la
  // lista, y es donde el aviso tiene que nombrarse para que se reconozca.
  email: (value, message) => `mailto:${value}?subject=${encodeURIComponent(message)}`,
};

export function contactActionHref(method: ContactMethod, value: string, message: string): string {
  return CONTACT_ACTION[method](value, message);
}
