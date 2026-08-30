import type { ListingEditViolation } from "../../src/modules/listing-publication/domain/listing-edit";
import {
  MAX_DESCRIPTION_CHARACTERS,
  MAX_PHOTOS_PER_LISTING,
  MAX_TITLE_CHARACTERS,
  MIN_DESCRIPTION_CHARACTERS,
  type PublishViolation,
} from "../../src/modules/listing-publication/domain/publishable-listing";

/**
 * The Spanish a publisher reads, mapped from the domain's stable violation
 * codes (SISTEMA.md screen 3).
 *
 * The domain returns codes rather than sentences on purpose: prose in the
 * validator would hard-code Spanish into the layer the broker importer also
 * calls. The cost of that decision is one risk — a code with no copy — and it
 * is paid here with a `Record` over the union, so adding a violation to the
 * domain stops this file compiling until someone writes the sentence.
 *
 * ## Two rules from the design that are not decoration
 *
 * **`✱` plus the word "obligatorio", never colour alone.** A red border is
 * invisible to a colour-blind publisher and to forced-colors mode, and this
 * form is filled one-handed on a phone in daylight.
 *
 * **The message names the offending value where it has one.** "Mínimo 120
 * caracteres" alone makes someone count; "Vas 24" tells them how far they
 * are. The design writes the second version.
 *
 * **A qué campo pertenece cada código ya no vive acá** (tasks.md 18.22). Esta
 * tabla lleva el español y nada más; el campo lo contesta
 * `LISTING_VIOLATION_FIELD`, en el dominio y bajo el piso del 90 %, porque
 * decide dónde se lee el mensaje y no cómo suena. Dos listas del mismo dato es
 * como una pantalla termina poniendo el mensaje de `zoneId` debajo de la ciudad.
 */

export interface PublishCopyContext {
  /** The submitted description, so the counter reports what was written. */
  readonly description?: string;
  /** Pre-counted alternative, for callers that already measured. */
  readonly descriptionLength?: number;
  /** El titulo enviado, por el mismo motivo: el paso 6 tambien cuenta. */
  readonly title?: string;
}

export interface ViolationCopy {
  readonly message: (context: PublishCopyContext) => string;
}

const REQUIRED = "✱ obligatorio";

/**
 * Code points, matching `validatePublishableListing` exactly. Using
 * `String.length` here would count an emoji twice, so the counter would
 * credit a publisher with more characters than the rule does — and the form
 * would reject a description its own counter called long enough.
 */
function countCharacters(context: PublishCopyContext): number {
  if (context.descriptionLength !== undefined) return context.descriptionLength;
  return [...(context.description ?? "")].length;
}

/** Puntos de codigo, igual que el validador y por la misma razon. */
function countTitleCharacters(context: PublishCopyContext): number {
  return [...(context.title ?? "")].length;
}

export const PUBLISH_VIOLATION_COPY: Record<PublishViolation, ViolationCopy> = {
  // The design's help text says this cannot be changed after publishing, so
  // the error explains the choice rather than nagging about an empty field.
  "publisherType.required": {
    message: () => `${REQUIRED}. Elegí si publicás como dueño o como inmobiliaria.`,
  },
  "publisherType.invalid": {
    message: () => "Elegí una de las dos opciones: dueño o inmobiliaria.",
  },
  "propertyType.required": {
    message: () => "Decinos qué vas a alquilar.",
  },
  "propertyType.invalid": {
    message: () => "Elegí una de las cinco opciones de la lista.",
  },
  "title.required": {
    message: () => `${REQUIRED}. Escribí un título, como lo dirías vos.`,
  },
  // Se dice cuanto sobra, no "acortalo". El paso 6 ya dibuja "37 / 90"
  // mientras se escribe, asi que el mensaje no puede ser menos preciso que el
  // contador que lo acompana.
  "title.tooLong": {
    message: (context) =>
      `Máximo ${MAX_TITLE_CHARACTERS} caracteres. Vas ${countTitleCharacters(context)}.`,
  },
  "description.required": {
    message: () => `${REQUIRED}. Contá cómo es el inmueble.`,
  },
  "description.tooShort": {
    message: (context) =>
      `✱ Mínimo ${MIN_DESCRIPTION_CHARACTERS} caracteres. Vas ${countCharacters(context)}.`,
  },
  // The publisher is not told to "shorten it" without knowing by how much,
  // for the same reason the minimum reports how far along they are.
  "description.tooLong": {
    message: (context) =>
      `Máximo ${MAX_DESCRIPTION_CHARACTERS} caracteres. Vas ${countCharacters(context)}.`,
  },
  "priceUsd.required": {
    message: () => `${REQUIRED}. Poné el alquiler mensual en dólares.`,
  },
  // "solo el número": no currency selector exists, so the error must not
  // suggest one is missing.
  "priceUsd.invalid": {
    message: () => "Solo el número, en dólares y sin centavos. Por ejemplo: 520.",
  },
  "cityId.required": {
    message: () => `${REQUIRED}. Elegí la ciudad.`,
  },
  "cityId.unknown": {
    message: () => "Por ahora publicamos en Distrito Capital y Maracaibo.",
  },
  "zoneId.required": {
    message: () => `${REQUIRED}. Elegí la zona.`,
  },
  // The publisher did nothing wrong here — a stale city/zone pair is what the
  // browser posts when the city changes without the zone. Blaming them for it
  // would be blaming them for the form's own behaviour.
  "zoneId.notInCity": {
    message: () => "Esa zona no pertenece a la ciudad elegida. Elegí una de la lista.",
  },
  "rooms.required": {
    message: () => `${REQUIRED}. ¿Cuántas habitaciones tiene?`,
  },
  // A studio is one room, not zero — the validator refuses zero, so the copy
  // has to say what to put instead rather than leaving someone stuck.
  "rooms.invalid": {
    message: () => "Un número entero de habitaciones. Un estudio cuenta como 1.",
  },
  "areaM2.required": {
    message: () => `${REQUIRED}. ¿Cuántos metros cuadrados tiene?`,
  },
  "areaM2.invalid": {
    message: () => "Los metros cuadrados, en números enteros. Por ejemplo: 78.",
  },
  "bathrooms.required": {
    message: () => `${REQUIRED}. ¿Cuántos baños tiene?`,
  },
  "bathrooms.invalid": {
    message: () => "Un número entero de baños. Contá el de servicio si lo tiene.",
  },
  // No `parkingSpots.required` exists, and that is deliberate: the field is
  // optional and defaults to 0. This copy only fires when somebody typed
  // something that is not a whole number -- so it says what shape to use and
  // names zero as a real answer rather than a way to skip the question.
  "parkingSpots.invalid": {
    message: () => "Un número entero. Si no tiene, poné 0.",
  },
  // The reveal button's whole purpose. A listing without a contact is a dead
  // end wearing a button.
  "contactMethod.required": {
    message: () => `${REQUIRED}. ¿Por dónde querés que te escriban?`,
  },
  "contactMethod.invalid": {
    message: () => "Elegí WhatsApp, teléfono o correo.",
  },
  "contactValue.required": {
    message: () => `${REQUIRED}. Poné el dato por el que te contactan.`,
  },
  // Shape, not verification: nothing here proves the line rings. It catches
  // the typo while the publisher is still on the form, which is the only
  // moment it is cheap to fix.
  "contactValue.invalid": {
    message: () => "Revisá el dato: un correo lleva @, y un teléfono solo números.",
  },
  "photos.required": {
    message: () => `${REQUIRED}. Subí al menos una foto en el paso 2.`,
  },
  "photos.tooMany": {
    message: () => `Hasta ${MAX_PHOTOS_PER_LISTING} fotos por aviso. Elegí las mejores.`,
  },
};

export function publishViolationMessage(
  violation: PublishViolation,
  context: PublishCopyContext,
): string {
  return PUBLISH_VIOLATION_COPY[violation].message(context);
}

/**
 * La promesa del paso 9, escrita UNA vez (tasks.md 18.20).
 *
 * La lámina de Publicar destaca la segunda mitad en negrita, así que su
 * marcado no se puede reusar tal cual; las palabras sí, y son las que
 * importan. La pantalla de editar dice la frase entera donde debería haber
 * estado el campo, y la negativa del dominio la repite: dos literales de la
 * misma promesa es como una pantalla termina prometiendo algo que la otra no
 * cumple.
 */
export const PUBLISHER_TYPE_IMMUTABLE_LEAD = "Aparece siempre en tu aviso y ";
export const PUBLISHER_TYPE_IMMUTABLE_STRESS = "no se puede cambiar después";
export const PUBLISHER_TYPE_IMMUTABLE_NOTICE = `${PUBLISHER_TYPE_IMMUTABLE_LEAD}${PUBLISHER_TYPE_IMMUTABLE_STRESS}.`;

/**
 * El español de una edición: la MISMA tabla de arriba para los códigos
 * compartidos, más el único que es propio de este camino.
 *
 * **Delegar y no copiar** es lo que hace que «Vas 24» siga diciendo 24 al
 * editar. Una segunda tabla al lado de ésta —y al lado de `CHANGE_FIELD_LABEL`,
 * que ya es la única lista de nombres de campo del repositorio— sería la que
 * después nadie mantiene.
 */
export function listingEditViolationMessage(
  violation: ListingEditViolation | string,
  context: PublishCopyContext,
): string {
  if (violation === "publisherType.immutable") {
    return `Quién publica se declara una vez. ${PUBLISHER_TYPE_IMMUTABLE_NOTICE}`;
  }

  // **`string` y no la unión, y el `??` no es un descuido.** Los códigos vuelven
  // por la URL porque sin JavaScript no hay otro lugar donde devolverle la
  // negativa a la pantalla, así que una dirección escrita a mano es dato de
  // afuera: indexar la tabla con lo que traiga daría `undefined.message`, o sea
  // un 500 donde correspondía una frase. Vuelve el código —el mismo
  // `?? reason` de `importRowReasonText`— y la garantía de que ningún código
  // REAL se quede sin copia la sigue dando el `Record` sobre la unión, que no
  // compila si el dominio agrega uno.
  return PUBLISH_VIOLATION_COPY[violation as PublishViolation]?.message(context) ?? violation;
}
