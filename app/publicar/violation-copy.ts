import {
  MAX_DESCRIPTION_CHARACTERS,
  MAX_PHOTOS_PER_LISTING,
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
 */

export type PublishField =
  | "publisherType"
  | "propertyType"
  | "title"
  | "description"
  | "priceUsd"
  | "cityId"
  | "zoneId"
  | "rooms"
  | "areaM2"
  | "bathrooms"
  | "parkingSpots"
  | "photos"
  | "contactMethod"
  | "contactValue";

export interface PublishCopyContext {
  /** The submitted description, so the counter reports what was written. */
  readonly description?: string;
  /** Pre-counted alternative, for callers that already measured. */
  readonly descriptionLength?: number;
}

export interface ViolationCopy {
  readonly field: PublishField;
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

export const PUBLISH_VIOLATION_COPY: Record<PublishViolation, ViolationCopy> = {
  // The design's help text says this cannot be changed after publishing, so
  // the error explains the choice rather than nagging about an empty field.
  "publisherType.required": {
    field: "publisherType",
    message: () => `${REQUIRED}. Elegí si publicás como dueño o como inmobiliaria.`,
  },
  "publisherType.invalid": {
    field: "publisherType",
    message: () => "Elegí una de las dos opciones: dueño o inmobiliaria.",
  },
  "propertyType.required": {
    field: "propertyType",
    message: () => "Decinos qué vas a alquilar.",
  },
  "propertyType.invalid": {
    field: "propertyType",
    message: () => "Elegí una de las cinco opciones de la lista.",
  },
  "title.required": {
    field: "title",
    message: () => `${REQUIRED}. Escribí un título, como lo dirías vos.`,
  },
  "description.required": {
    field: "description",
    message: () => `${REQUIRED}. Contá cómo es el inmueble.`,
  },
  "description.tooShort": {
    field: "description",
    message: (context) =>
      `✱ Mínimo ${MIN_DESCRIPTION_CHARACTERS} caracteres. Vas ${countCharacters(context)}.`,
  },
  // The publisher is not told to "shorten it" without knowing by how much,
  // for the same reason the minimum reports how far along they are.
  "description.tooLong": {
    field: "description",
    message: (context) =>
      `Máximo ${MAX_DESCRIPTION_CHARACTERS} caracteres. Vas ${countCharacters(context)}.`,
  },
  "priceUsd.required": {
    field: "priceUsd",
    message: () => `${REQUIRED}. Poné el alquiler mensual en dólares.`,
  },
  // "solo el número": no currency selector exists, so the error must not
  // suggest one is missing.
  "priceUsd.invalid": {
    field: "priceUsd",
    message: () => "Solo el número, en dólares y sin centavos. Por ejemplo: 520.",
  },
  "cityId.required": {
    field: "cityId",
    message: () => `${REQUIRED}. Elegí la ciudad.`,
  },
  "cityId.unknown": {
    field: "cityId",
    message: () => "Por ahora publicamos en Distrito Capital y Maracaibo.",
  },
  "zoneId.required": {
    field: "zoneId",
    message: () => `${REQUIRED}. Elegí la zona.`,
  },
  // The publisher did nothing wrong here — a stale city/zone pair is what the
  // browser posts when the city changes without the zone. Blaming them for it
  // would be blaming them for the form's own behaviour.
  "zoneId.notInCity": {
    field: "zoneId",
    message: () => "Esa zona no pertenece a la ciudad elegida. Elegí una de la lista.",
  },
  "rooms.required": {
    field: "rooms",
    message: () => `${REQUIRED}. ¿Cuántas habitaciones tiene?`,
  },
  // A studio is one room, not zero — the validator refuses zero, so the copy
  // has to say what to put instead rather than leaving someone stuck.
  "rooms.invalid": {
    field: "rooms",
    message: () => "Un número entero de habitaciones. Un estudio cuenta como 1.",
  },
  "areaM2.required": {
    field: "areaM2",
    message: () => `${REQUIRED}. ¿Cuántos metros cuadrados tiene?`,
  },
  "areaM2.invalid": {
    field: "areaM2",
    message: () => "Los metros cuadrados, en números enteros. Por ejemplo: 78.",
  },
  "bathrooms.required": {
    field: "bathrooms",
    message: () => `${REQUIRED}. ¿Cuántos baños tiene?`,
  },
  "bathrooms.invalid": {
    field: "bathrooms",
    message: () => "Un número entero de baños. Contá el de servicio si lo tiene.",
  },
  // No `parkingSpots.required` exists, and that is deliberate: the field is
  // optional and defaults to 0. This copy only fires when somebody typed
  // something that is not a whole number -- so it says what shape to use and
  // names zero as a real answer rather than a way to skip the question.
  "parkingSpots.invalid": {
    field: "parkingSpots",
    message: () => "Un número entero. Si no tiene, poné 0.",
  },
  // The reveal button's whole purpose. A listing without a contact is a dead
  // end wearing a button.
  "contactMethod.required": {
    field: "contactMethod",
    message: () => `${REQUIRED}. ¿Por dónde querés que te escriban?`,
  },
  "contactMethod.invalid": {
    field: "contactMethod",
    message: () => "Elegí WhatsApp, teléfono o correo.",
  },
  "contactValue.required": {
    field: "contactValue",
    message: () => `${REQUIRED}. Poné el dato por el que te contactan.`,
  },
  // Shape, not verification: nothing here proves the line rings. It catches
  // the typo while the publisher is still on the form, which is the only
  // moment it is cheap to fix.
  "contactValue.invalid": {
    field: "contactValue",
    message: () => "Revisá el dato: un correo lleva @, y un teléfono solo números.",
  },
  "photos.required": {
    field: "photos",
    message: () => `${REQUIRED}. Subí al menos una foto en el paso 2.`,
  },
  "photos.tooMany": {
    field: "photos",
    message: () => `Hasta ${MAX_PHOTOS_PER_LISTING} fotos por aviso. Elegí las mejores.`,
  },
};

export function publishViolationMessage(
  violation: PublishViolation,
  context: PublishCopyContext,
): string {
  return PUBLISH_VIOLATION_COPY[violation].message(context);
}
