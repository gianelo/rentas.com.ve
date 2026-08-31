import type { ListingEdit, ListingEditViolation } from "./listing-edit";

/**
 * tasks.md 18.22 — **a qué campo pertenece cada negativa, y qué hacer con las
 * que no pertenecen a ninguno de esta pantalla.**
 *
 * **Por qué acá y no en `violation-copy.ts`.** El español de un mensaje es
 * copia y vive en `app/` desde la 18.16. A qué campo pertenece NO es copia: es
 * lo que decide dónde se lee el mensaje —antes del control que lo produjo, con
 * `aria-invalid` y `aria-describedby`— y, cuando no hay control, decide que
 * igual se lea. Escrito adentro de una pantalla sería una regla fuera del piso
 * del 90 % (AGENTS.md §1).
 *
 * **Una sola tabla, no dos.** `ViolationCopy` llevaba `field` y dejó de
 * llevarlo el día que apareció ésta: dos listas del mismo dato es como una
 * pantalla termina poniendo el mensaje de `zoneId` debajo de la ciudad.
 * `PublishStep` y la pantalla de editar leen las dos de acá.
 *
 * **`Record` sobre la unión de editar**, que contiene entera la de publicar
 * más `publisherType.immutable`: agregar un código al dominio deja de compilar
 * este archivo hasta que alguien diga a qué campo pertenece, exactamente la
 * garantía que `PUBLISH_VIOLATION_COPY` ya daba para la frase.
 */

/** Los quince campos que un aviso tiene, tal como los nombran los códigos. */
export type ListingField =
  | "publisherType"
  | "propertyType"
  | "title"
  | "description"
  | "priceUsd"
  | "cityId"
  | "zoneId"
  /**
   * La referencia (18.7). **Tiene campo al publicar y no al editar**, y por
   * eso figura acá y NO en `EDIT_REQUEST_FIELD`: la tabla del fundador de la
   * 18.14 no la nombra entre lo que una edición puede tocar, así que su
   * negativa cae en `elsewhere` en vez de colgarse de un control que la
   * pantalla de editar no dibuja.
   */
  | "reference"
  | "rooms"
  | "areaM2"
  | "bathrooms"
  | "parkingSpots"
  | "photos"
  | "contactMethod"
  | "contactValue";

export const LISTING_VIOLATION_FIELD: Record<ListingEditViolation, ListingField> = {
  "publisherType.required": "publisherType",
  "publisherType.invalid": "publisherType",
  // El único que no es de publicar, y el que la 18.22 nombraba como el hueco:
  // sin él, la negativa de quién publica no tenía dónde leerse.
  "publisherType.immutable": "publisherType",
  "propertyType.required": "propertyType",
  "propertyType.invalid": "propertyType",
  "title.required": "title",
  "title.tooLong": "title",
  "description.required": "description",
  "description.tooShort": "description",
  "description.tooLong": "description",
  "priceUsd.required": "priceUsd",
  "priceUsd.invalid": "priceUsd",
  "cityId.required": "cityId",
  "cityId.unknown": "cityId",
  "zoneId.required": "zoneId",
  // Del par ciudad/zona, la zona: es el control que hay que volver a elegir.
  "zoneId.notInCity": "zoneId",
  "reference.tooLong": "reference",
  "rooms.required": "rooms",
  "rooms.invalid": "rooms",
  "areaM2.required": "areaM2",
  "areaM2.invalid": "areaM2",
  "bathrooms.required": "bathrooms",
  "bathrooms.invalid": "bathrooms",
  "parkingSpots.invalid": "parkingSpots",
  "contactMethod.required": "contactMethod",
  "contactMethod.invalid": "contactMethod",
  "contactValue.required": "contactValue",
  "contactValue.invalid": "contactValue",
  "photos.required": "photos",
  "photos.tooMany": "photos",
};

/**
 * Los campos que un pedido de edición puede traer: los ocho que escribe más
 * `publisherType`, que viaja para ser rechazado y no para ser aplicado.
 *
 * **`Record<keyof ListingEdit, true>` y no una lista suelta**, que es lo que
 * hace que agregar un campo editable sin decir acá que se puede colocar deje
 * de compilar. Una lista escrita al lado de `ListingEdit` sería la segunda
 * fuente que después queda diciendo ocho cuando ya son nueve.
 */
const EDIT_REQUEST_FIELD: Record<keyof ListingEdit, true> = {
  title: true,
  description: true,
  priceUsd: true,
  rooms: true,
  bathrooms: true,
  areaM2: true,
  contactMethod: true,
  contactValue: true,
  publisherType: true,
};

export interface PlacedEditViolations {
  /** Una por campo: la primera gana, igual que `errorsByField` en publicar. */
  readonly byField: ReadonlyMap<ListingField, ListingEditViolation>;
  /**
   * Las que no tienen dónde: un código que esta tabla no conoce, o uno sobre
   * algo que una edición no manda (fotos, zona, ciudad, tipo de inmueble,
   * puestos). **Se dicen igual.** Tragárselas dejaría un formulario que se
   * niega a guardar sin decir por qué, que es peor que un bloque arriba.
   */
  readonly elsewhere: readonly string[];
}

/**
 * Reparte las negativas de una edición entre los campos que la pantalla dibuja
 * y las que no tienen ninguno.
 *
 * **Recibe `string` y no la unión**, por la misma razón que
 * `listingEditViolationMessage`: los códigos vuelven en la dirección —sin
 * JavaScript no hay otro lugar donde devolverle la negativa a la pantalla—, así
 * que una dirección escrita a mano es dato de afuera y no puede indexar una
 * tabla a ciegas.
 */
export function placeListingEditViolations(codes: readonly string[]): PlacedEditViolations {
  const byField = new Map<ListingField, ListingEditViolation>();
  const elsewhere: string[] = [];

  for (const code of codes) {
    const field = LISTING_VIOLATION_FIELD[code as ListingEditViolation] as ListingField | undefined;

    if (field === undefined || !Object.hasOwn(EDIT_REQUEST_FIELD, field)) {
      elsewhere.push(code);
      continue;
    }

    // Un campo, un mensaje. Dos frases apiladas sobre un control se leen como
    // dos problemas cuando son el mismo campo mal cargado.
    if (byField.has(field)) continue;
    byField.set(field, code as ListingEditViolation);
  }

  return { byField, elsewhere };
}
