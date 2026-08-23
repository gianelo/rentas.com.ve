import type {
  DraftPhoto,
  PublicationDraft,
} from "../../src/modules/listing-publication/domain/publication-steps";
import {
  MAX_PHOTOS_PER_LISTING,
  type PublishViolation,
} from "../../src/modules/listing-publication/domain/publishable-listing";

/**
 * El borrador de los nueve pasos, y las tres decisiones que lo definen.
 *
 * ## 1. Treinta minutos, no diez
 *
 * El borrador de cookie de diez minutos alcanzaba para dos pantallas. Para
 * nueve no: elegir fotos de la galeria en un telefono lento se come varios
 * minutos, y quien vuelve a una pantalla y encuentra el formulario vacio
 * empieza de cero o no empieza. Treinta es el minimo que la seccion 5 de la
 * especificacion acepta cuando el borrador no vive del lado del servidor.
 *
 * ## 2. Por que no vive del lado del servidor, que es lo que la spec recomienda
 *
 * Guardar por paso con la sesion como llave necesita una tabla
 * `publish_draft`, y una tabla necesita una migracion — `src/shared/db/schema.ts`
 * y `drizzle/` no se tocan en esta entrega. La recomendacion queda anotada
 * como dependencia; lo que se entrega es el minimo que la propia
 * especificacion define, con el tope de 1.200 caracteres tratado como lo que
 * pasa a ser en cuanto el borrador entra en una cookie: **una restriccion
 * tecnica, no una preferencia de producto.**
 *
 * ## 3. Dos cookies, y la division no es prolijidad
 *
 * La descripcion sola, a 1.200 caracteres acentuados, son 2.400 bytes en
 * UTF-8 y ~3.200 caracteres en base64url. Todo lo demas — nueve pasos, seis
 * claves de foto con el id del publicador adentro, la referencia — no entra
 * al lado de eso en los ~4 KB que un navegador acepta por cookie, contando
 * nombre y atributos. El modo de falla seria el peor posible: un pedido que
 * llega sin su cookie, en produccion, a un tamano que nadie puede reproducir
 * a pedido, y un formulario que se vacia solo. El test mide el peor caso real
 * en vez de confiar en este parrafo.
 *
 * ## Por que no va firmada, dicho para que nadie lo "arregle" despues
 *
 * Todo lo que hay aca es de quien publica, y puede cambiarlo tecleando de
 * nuevo. Manipularla no compra nada. El unico campo que jamas puede venir del
 * cliente — el id del publicador — no esta y nunca va a estar: sale de la
 * sesion, y eso es lo que hace que la verificacion de propiedad de las fotos
 * signifique algo. `httpOnly` y `sameSite=lax` se llevan igual, porque un
 * borrador sigue siendo lo que alguien escribio sin terminar.
 */

export const DRAFT_COOKIE = "rentas_publish_draft";
/** La descripcion, aparte. Ver la decision 3 arriba. */
export const DRAFT_TEXT_COOKIE = "rentas_publish_texto";

export const DRAFT_TTL_SECONDS = 30 * 60;

export const DRAFT_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/publicar",
  maxAge: DRAFT_TTL_SECONDS,
  secure: process.env.NODE_ENV === "production",
} as const;

/**
 * Lo tecleado que vuelve para mostrarse al lado de su error.
 *
 * Un precio escrito "quinientos" no sobrevive al parseo, y el redirect que
 * sigue a un paso invalido se lleva el `FormData`. Sin esto, el mensaje
 * "Solo el numero" aparece sobre un campo vacio y quien lo lee no sabe que
 * escribio mal. Cuarenta caracteres alcanzan para cualquiera de estos campos
 * y cierran el canal para meter kilobytes en la cookie.
 */
export const MAX_RAW_LENGTH = 40;

/** Solo campos numericos: son los unicos cuyo texto crudo se pierde al parsear. */
const RAW_KEYS = ["priceUsd", "rooms", "bathrooms", "parkingSpots", "areaM2"] as const;

export interface StoredDraft extends PublicationDraft {
  /** Del ultimo intento. Vacia mientras se avanza sin errores. */
  readonly violations: readonly PublishViolation[];
  readonly raw?: Readonly<Record<string, string>>;
}

export function emptyDraft(): StoredDraft {
  return { listing: {}, photos: [], violations: [] };
}

/**
 * Lista blanca por campo Y por tipo.
 *
 * El tipo importa tanto como el nombre: un precio que llegara como `"450"`
 * pasaria el validador convertido en `NaN` — o peor, se colaria hasta una
 * columna `integer`. Se descarta antes de que exista la oportunidad.
 */
const TEXT_KEYS = [
  "propertyType",
  "cityId",
  "zoneId",
  "title",
  "publisherType",
  "contactMethod",
  "contactValue",
] as const;

const NUMBER_KEYS = ["priceUsd", "rooms", "bathrooms", "parkingSpots", "areaM2"] as const;

const BOOLEAN_KEYS = [
  "hasPowerPlant",
  "hasRegularWater",
  "isFurnished",
  "hasSecurity",
  "hasAppliances",
] as const;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(raw: string | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    // Una cookie truncada o editada a mano no es un error que valga la pena
    // mostrar: quien publica recibe un formulario vacio, que se recupera.
    return undefined;
  }
}

function readPhotos(value: unknown): DraftPhoto[] {
  if (!Array.isArray(value)) return [];

  const photos: DraftPhoto[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { key, name, bytes } = entry as Record<string, unknown>;
    // Media foto no es una foto: sin clave no hay nada que descargar, y sin
    // nombre ni tamano la pantalla de revisar dibujaria una fila vacia.
    if (typeof key !== "string" || typeof name !== "string" || typeof bytes !== "number") continue;
    photos.push({ key, name, bytes });
    // El tope del dominio, aplicado tambien aca. Cada foto cuesta una
    // descarga y un decodificado de `sharp` dentro de una funcion con memoria
    // fija: una lista sin techo es un pedido que decide cuanto computo gasta.
    if (photos.length === MAX_PHOTOS_PER_LISTING) break;
  }
  return photos;
}

function readRaw(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const source = value as Record<string, unknown>;
  const raw: Record<string, string> = {};
  for (const key of RAW_KEYS) {
    const entry = source[key];
    if (typeof entry === "string") raw[key] = entry.slice(0, MAX_RAW_LENGTH);
  }
  return Object.keys(raw).length > 0 ? raw : undefined;
}

/**
 * Devuelve `null` para cualquier cosa que no sea un borrador escrito por esta
 * aplicacion. Los campos desconocidos se descartan en vez de arrastrarse.
 */
export function parseStoredDraft(
  rawDraft: string | undefined,
  rawText: string | undefined,
): StoredDraft | null {
  const parsed = decode(rawDraft);
  if (typeof parsed !== "object" || parsed === null) return null;

  const candidate = parsed as Record<string, unknown>;
  const source = (
    typeof candidate.listing === "object" && candidate.listing !== null ? candidate.listing : {}
  ) as Record<string, unknown>;

  const listing: Record<string, unknown> = {};
  for (const key of TEXT_KEYS) {
    if (typeof source[key] === "string") listing[key] = source[key];
  }
  for (const key of NUMBER_KEYS) {
    if (typeof source[key] === "number") listing[key] = source[key];
  }
  for (const key of BOOLEAN_KEYS) {
    if (typeof source[key] === "boolean") listing[key] = source[key];
  }

  // La descripcion viene de la otra cookie y ninguna otra cosa viene con ella,
  // asi que se acepta solo si decodifica a texto.
  // Vacia se descarta en vez de guardarse: `""` y "todavia no la escribio"
  // son lo mismo para el validador, y arrastrar la cadena vacia haria que un
  // borrador recien empezado no volviera igual que como salio.
  const description = decode(rawText);
  if (typeof description === "string" && description !== "") listing.description = description;

  const violations = Array.isArray(candidate.violations)
    ? candidate.violations.filter((entry): entry is PublishViolation => typeof entry === "string")
    : [];

  const draft: StoredDraft = {
    listing: listing as StoredDraft["listing"],
    photos: readPhotos(candidate.photos),
    violations,
    ...(candidate.featuresDeclared === true ? { featuresDeclared: true } : {}),
    ...(typeof candidate.reference === "string" ? { reference: candidate.reference } : {}),
  };

  const raw = readRaw(candidate.raw);
  return raw ? { ...draft, raw } : draft;
}

/** Dos valores: el borrador y la descripcion. Ver la decision 3 arriba. */
export function serialiseStoredDraft(draft: StoredDraft): {
  readonly draft: string;
  readonly text: string;
} {
  const { description, ...listing } = draft.listing;

  return {
    draft: encode({
      listing,
      photos: draft.photos,
      violations: draft.violations,
      ...(draft.featuresDeclared === true ? { featuresDeclared: true } : {}),
      ...(draft.reference !== undefined ? { reference: draft.reference } : {}),
      ...(draft.raw !== undefined ? { raw: draft.raw } : {}),
    }),
    text: encode(description ?? ""),
  };
}
