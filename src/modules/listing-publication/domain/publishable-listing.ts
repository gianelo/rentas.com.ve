/**
 * Minimum publishable content, as the listing-publication spec defines it,
 * expressed as a pure function over a draft.
 *
 * Pure and dependency-free on purpose (design.md, module layering): this is
 * the layer carrying the 90% coverage floor, and it is the only place the
 * publish rules exist. The spec's "Uniform Validation Across Every Entry
 * Path" requirement is what makes that mandatory rather than tidy — the
 * broker bulk import (Phase 9) must be held to exactly these rules, and it
 * will call exactly this function. A rule implemented in a form handler is
 * a rule the importer does not have.
 */

export type PublisherType = "owner" | "broker";

/**
 * Qué se alquila. Lista cerrada de cinco, decidida por el fundador
 * (2026-08-22): la que la ficha muestra junto a la ubicación y la que el
 * buscador de sugerencias traduce cuando alguien escribe "anexo maracaibo".
 *
 * `local comercial` se propuso y se retiró: el producto es residencial, y
 * dejarlo entrar habría roto `rooms` NOT NULL y la tira de cuatro celdas.
 */
export type PropertyType = "apartamento" | "casa" | "quinta" | "anexo" | "habitacion";

/**
 * How the publisher wants to be reached (founder, 2026-08-18): "el valor que
 * quiera mostrar la persona. Sea email, WhatsApp o número de teléfono."
 *
 * A single `whatsapp` column would have forced everyone who prefers email to
 * lie in it — and the reveal button's label comes from this, so a listing
 * that says "Ver WhatsApp" while holding an address is a promise the product
 * does not keep.
 */
export type ContactMethod = "whatsapp" | "telefono" | "email";

export interface DraftListing {
  readonly publisherType?: PublisherType;
  readonly propertyType?: PropertyType;
  /** Los cinco de la F6. Opcionales en el borrador, `false` en la fila. */
  readonly hasPowerPlant?: boolean;
  readonly hasRegularWater?: boolean;
  readonly isFurnished?: boolean;
  readonly hasSecurity?: boolean;
  readonly hasAppliances?: boolean;
  readonly title?: string;
  readonly description?: string;
  readonly priceUsd?: number;
  readonly cityId?: string;
  readonly zoneId?: string;
  readonly contactMethod?: ContactMethod;
  readonly contactValue?: string;
  readonly photoCount?: number;
  readonly rooms?: number;
  readonly areaM2?: number;
  readonly bathrooms?: number;
  /**
   * Optional on the DRAFT, never on the row. The form supplies 0 when the
   * publisher leaves it alone, so `undefined` here means "the caller never
   * asked", not "the property has no parking" -- and only the second is a
   * fact worth storing.
   */
  readonly parkingSpots?: number;
}

/** A curated zone, scoped to its city. Free-text zones do not exist (D5). */
export interface CuratedZone {
  readonly id: string;
  readonly cityId: string;
}

/**
 * Stable, translatable codes rather than sentences. The publish form renders
 * Spanish copy next to the field that failed (SISTEMA.md screen 3), and a
 * validator that returned prose would either hard-code that copy in the
 * domain layer or force the form to match on strings.
 */
export type PublishViolation =
  | "publisherType.required"
  | "publisherType.invalid"
  | "propertyType.required"
  | "propertyType.invalid"
  | "title.required"
  | "title.tooLong"
  | "description.required"
  | "description.tooShort"
  | "description.tooLong"
  | "priceUsd.required"
  | "priceUsd.invalid"
  | "cityId.required"
  | "cityId.unknown"
  | "zoneId.required"
  | "zoneId.notInCity"
  | "rooms.required"
  | "rooms.invalid"
  | "areaM2.required"
  | "areaM2.invalid"
  | "bathrooms.required"
  | "bathrooms.invalid"
  | "parkingSpots.invalid"
  | "photos.required"
  | "contactMethod.required"
  | "contactMethod.invalid"
  | "contactValue.required"
  | "contactValue.invalid"
  | "photos.tooMany";

/**
 * SISTEMA.md screen 3 ships a live counter against this exact number. The
 * constant is exported so the form can render the counter from the same
 * source the validator enforces — two copies of "120" is how a counter comes
 * to disagree with the rule it is counting toward.
 */
export const MIN_DESCRIPTION_CHARACTERS = 120;

/**
 * 1,200 characters — ten times the minimum, and roughly 200 words.
 *
 * **The design states a minimum and a counter but no ceiling**, and `text`
 * has none in Postgres either, so until now nothing stopped megabytes of
 * pasted prose from landing in a mandatory column, six listings at a time,
 * against a free tier.
 *
 * The number is chosen on product grounds rather than storage ones: nobody
 * reads 1,200+ characters of rental copy on a phone, and the detail page has
 * to render whatever is stored. A publisher with more to say has photos and
 * a WhatsApp conversation, which is where the rest of it belongs.
 */
export const MAX_DESCRIPTION_CHARACTERS = 1_200;

/**
 * Noventa. El numero es de la especificacion de Publicar (seccion 3, "Maximo
 * 90 caracteres"), y hasta ahora nada lo aplicaba.
 *
 * **El paso 6 dibuja el contador "37 / 90" mientras alguien escribe.** Un
 * contador que anuncia un tope que el validador no conoce es peor que no
 * tenerlo: promete un limite y despues acepta el doble, y quien recorta su
 * titulo para entrar lo hizo por nada. La tarjeta de la lista, ademas,
 * recorta con `--tclamp` a dos lineas, asi que lo que pase de aca no
 * desaparece del aviso: desaparece de la unica pantalla donde se elige.
 */
export const MAX_TITLE_CHARACTERS = 90;

/**
 * Six. **The number is design.md's, but the enforcement is new here**: D12's
 * storage arithmetic ("six per listing is roughly 30 MB") assumes a ceiling
 * that nothing was actually applying, so the ~7,000-listing figure the free
 * tier is planned around rested on publishers being moderate.
 *
 * It is also the cheapest DoS bound this flow has. Each photo costs a network
 * read plus a `sharp` decode inside a serverless function with a fixed memory
 * ceiling, so an unbounded array is a request that decides how much compute
 * it gets to spend.
 */
export const MAX_PHOTOS_PER_LISTING = 6;

const PUBLISHER_TYPES: readonly string[] = ["owner", "broker"];
const CONTACT_METHODS: readonly string[] = ["whatsapp", "telefono", "email"];
const PROPERTY_TYPES: readonly string[] = ["apartamento", "casa", "quinta", "anexo", "habitacion"];

/**
 * Shape checks, not verification. Neither proves the address exists or the
 * line rings — only sending something does, and phone verification is a
 * disabled port (design.md D9). What they catch is the typo a publisher can
 * fix while they are still on the form, which is the only moment it is cheap:
 * afterwards the cost lands on a tenant who reveals a contact that goes
 * nowhere, and they have no way to tell that from being ignored.
 */
function looksLikeEmail(value: string): boolean {
  // Deliberately loose. The strict grammar for an address is famously
  // unimplementable, and every over-tight regex rejects somebody's real one.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/**
 * Venezuelan numbers are 11 digits (0412…) or 12 with the country code
 * (58412…). Separators are stripped before counting, because "0412 123 4567"
 * and "0412-1234567" are the same number written the way people write it, and
 * refusing one of them teaches publishers to distrust the form.
 */
function looksLikePhone(value: string): boolean {
  const digits = value.replace(/[\s()+.-]/g, "");
  return /^\d{10,13}$/.test(digits);
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/**
 * Character count, not `String.length`, which counts UTF-16 code units. For
 * ordinary Spanish the two agree — but the moment a description carries an
 * emoji or any astral-plane character, `.length` counts it twice and the
 * counter on screen would disagree with the rule.
 */
function characterCount(value: string): number {
  return [...value].length;
}

function isWholePositiveNumber(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Separate from the one above because ZERO IS A REAL ANSWER for parking and
 * a wrong one everywhere else. Reusing `isWholePositiveNumber` would refuse
 * "no parking", and defaulting a missing value to 0 would silently claim it.
 */
function isWholeNonNegativeNumber(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Returns EVERY violation, never throwing and never stopping at the first.
 * The form shows per-field errors, and a fail-fast validator cannot fill
 * that screen: a publisher who left three fields empty would fix one,
 * resubmit, and only then be told about the next.
 */
export function validatePublishableListing(
  draft: DraftListing,
  curatedZones: readonly CuratedZone[],
): PublishViolation[] {
  const violations: PublishViolation[] = [];

  // No default is applied here, and none may be added later. A default
  // turns "the caller forgot" into "everyone is an owner", and the
  // owner/broker distinction is a trust guarantee (SISTEMA.md), not a
  // display preference.
  if (draft.publisherType === undefined) {
    violations.push("publisherType.required");
  } else if (!PUBLISHER_TYPES.includes(draft.publisherType)) {
    violations.push("publisherType.invalid");
  }

  // Sin default, igual que publisherType y por el mismo motivo: un default
  // convierte "al que se le olvidó" en "todos son apartamentos", y el tipo es
  // lo que separa un anexo de $150 de un apartamento de $150.
  if (draft.propertyType === undefined) {
    violations.push("propertyType.required");
  } else if (!PROPERTY_TYPES.includes(draft.propertyType)) {
    violations.push("propertyType.invalid");
  }

  if (isBlank(draft.title)) {
    violations.push("title.required");
  } else if (characterCount(draft.title as string) > MAX_TITLE_CHARACTERS) {
    // Puntos de codigo, igual que la descripcion y por el mismo motivo: el
    // contador de la pantalla cuenta caracteres, y `String.length` cuenta
    // unidades UTF-16. Contarlos distinto es como el formulario termina
    // rechazando un titulo que su propio contador dio por bueno.
    violations.push("title.tooLong");
  }

  if (isBlank(draft.description)) {
    violations.push("description.required");
  } else {
    const length = characterCount(draft.description as string);
    if (length < MIN_DESCRIPTION_CHARACTERS) {
      violations.push("description.tooShort");
    } else if (length > MAX_DESCRIPTION_CHARACTERS) {
      violations.push("description.tooLong");
    }
  }

  // "USD-Only Price": one numeric field, no currency selector, no
  // conversion. Whole dollars — the design shows prices as `$520`, never
  // with cents, and accepting fractions would render a value the row layout
  // has no room for.
  if (draft.priceUsd === undefined) {
    violations.push("priceUsd.required");
  } else if (!isWholePositiveNumber(draft.priceUsd)) {
    violations.push("priceUsd.invalid");
  }

  if (draft.cityId === undefined || draft.cityId.trim() === "") {
    violations.push("cityId.required");
  } else if (!curatedZones.some((zone) => zone.cityId === draft.cityId)) {
    // A city with no curated zone is not a city this product launches in.
    violations.push("cityId.unknown");
  }

  if (draft.zoneId === undefined || draft.zoneId.trim() === "") {
    violations.push("zoneId.required");
  } else if (
    !curatedZones.some((zone) => zone.id === draft.zoneId && zone.cityId === draft.cityId)
  ) {
    // D5 at the application boundary. The database refuses this pairing too,
    // through `listing`'s composite foreign key — but a constraint violation
    // surfaces as a 500, and this is a form error the publisher can fix.
    // Both layers are wanted: this one explains, that one guarantees.
    violations.push("zoneId.notInCity");
  }

  // `rooms` and `area_m2` are NOT NULL in the schema. They were declared on
  // `DraftListing` from the first version of this file and never checked,
  // which meant a draft missing either passed validation and failed at the
  // INSERT — a 500 where the publisher deserved a field error. Whole positive
  // numbers for the same reason the price is: the row layout renders "2 hab ·
  // 78 m²", and neither half has room for a fraction.
  //
  // A studio is one room, not zero. Zero is refused deliberately: `area_m2`
  // already carries the size, and a zero here reads as "unknown" wherever it
  // is rendered.
  if (draft.rooms === undefined) {
    violations.push("rooms.required");
  } else if (!isWholePositiveNumber(draft.rooms)) {
    violations.push("rooms.invalid");
  }

  if (draft.areaM2 === undefined) {
    violations.push("areaM2.required");
  } else if (!isWholePositiveNumber(draft.areaM2)) {
    violations.push("areaM2.invalid");
  }

  // Artboard 2b's stat strip reads `2 HAB | 2 BAÑOS | 78 M² | 1 PUESTO`, and
  // the four cells are drawn identically -- there is no empty state for one
  // of them. That is what decides the shape of these two rules.
  //
  // Bathrooms is required and positive: a home has at least one, and a blank
  // cell in a strip whose neighbours carry numbers reads as broken rather
  // than as absent.
  if (draft.bathrooms === undefined) {
    violations.push("bathrooms.required");
  } else if (!isWholePositiveNumber(draft.bathrooms)) {
    violations.push("bathrooms.invalid");
  }

  // Parking is the one field where zero is a fact rather than a gap: an
  // anexo with no puesto is a normal listing, and saying so is information a
  // tenant filters on. So there is no `parkingSpots.required` -- the form
  // sends 0 by default, and `undefined` is caught downstream by `present()`
  // rather than here, because a caller that omitted it entirely has a bug
  // the publisher cannot fix by editing a field.
  if (draft.parkingSpots !== undefined && !isWholeNonNegativeNumber(draft.parkingSpots)) {
    violations.push("parkingSpots.invalid");
  }

  // The contact is what the whole product exists to deliver: a tenant finds
  // a listing and gets a way to reach whoever published it. A listing without
  // one is a dead end wearing a reveal button.
  if (draft.contactMethod === undefined) {
    violations.push("contactMethod.required");
  } else if (!CONTACT_METHODS.includes(draft.contactMethod)) {
    violations.push("contactMethod.invalid");
  }

  if (isBlank(draft.contactValue)) {
    violations.push("contactValue.required");
  } else if (draft.contactMethod === "email") {
    if (!looksLikeEmail(draft.contactValue as string)) violations.push("contactValue.invalid");
  } else if (draft.contactMethod !== undefined) {
    if (!looksLikePhone(draft.contactValue as string)) violations.push("contactValue.invalid");
  }

  if (!draft.photoCount || draft.photoCount < 1) {
    violations.push("photos.required");
  } else if (draft.photoCount > MAX_PHOTOS_PER_LISTING) {
    violations.push("photos.tooMany");
  }

  return violations;
}
