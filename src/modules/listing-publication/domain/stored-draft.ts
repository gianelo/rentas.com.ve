import type { DraftPhoto, StoredPublicationDraft } from "./publication-steps";
import { MAX_PHOTOS_PER_LISTING, type PublishViolation } from "./publishable-listing";

/**
 * Qué se acepta como borrador guardado, **y por qué es UNA sola regla**.
 *
 * Vivía dentro de `app/publicar/draft.ts` mientras la cookie era el único lugar
 * donde un borrador se guardaba. Con `publish_draft` (18.29) hay una segunda
 * puerta, y la tentación era no validarla: la fila la escribió el servidor con
 * la sesión ya comprobada, así que nadie la manipuló. **Eso contesta la pregunta
 * equivocada.** Una fila no viene de un atacante; viene del formulario de ayer,
 * y vuelve con la forma de ayer — un campo renombrado, un número que se volvió
 * texto, una foto sin nombre. Dos validadores para el mismo borrador es la forma
 * de defecto que este cambio ya encontró ocho veces, así que hay uno.
 *
 * **Falla cerrado por campo, no por borrador** (AGENTS.md §7): lo que no encaja
 * se descarta y lo demás sobrevive. Perder los nueve pasos porque el 4 cambió de
 * tipo sería castigar a quien vuelve por un despliegue que no vio. Lo único que
 * devuelve `null` es una fila que no es un borrador en absoluto — ahí sí no hay
 * nada que rescatar, y `app/` la trata como formulario vacío, que se recupera.
 *
 * La lista blanca es por campo **Y por tipo**: el nombre solo no alcanza. Un
 * precio que llegara como `"450"` pasaría el validador convertido en `NaN` — o
 * peor, se colaría hasta una columna `integer`.
 */

const TEXT_KEYS = [
  "propertyType",
  "cityId",
  "zoneId",
  "title",
  "publisherType",
  "contactMethod",
  "contactValue",
  "reference",
] as const;

const NUMBER_KEYS = ["priceUsd", "rooms", "bathrooms", "parkingSpots", "areaM2"] as const;

const BOOLEAN_KEYS = [
  "hasPowerPlant",
  "hasRegularWater",
  "isFurnished",
  "hasSecurity",
  "hasAppliances",
] as const;

/** Solo campos numéricos: son los únicos cuyo texto crudo se pierde al parsear. */
const RAW_KEYS = ["priceUsd", "rooms", "bathrooms", "parkingSpots", "areaM2"] as const;

/**
 * Lo tecleado que vuelve para mostrarse al lado de su error.
 *
 * Un precio escrito "quinientos" no sobrevive al parseo, y el redirect que sigue
 * a un paso inválido se lleva el `FormData`. Sin esto, el mensaje "Solo el
 * número" aparece sobre un campo vacío. Cuarenta caracteres alcanzan para
 * cualquiera de estos campos y cierran el canal para guardar kilobytes.
 */
export const MAX_RAW_LENGTH = 40;

function readPhotos(value: unknown): DraftPhoto[] {
  if (!Array.isArray(value)) return [];

  const photos: DraftPhoto[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { key, name, bytes } = entry as Record<string, unknown>;
    // Media foto no es una foto: sin clave no hay nada que descargar, y sin
    // nombre ni tamaño la pantalla de revisar dibujaría una fila vacía.
    if (typeof key !== "string" || typeof name !== "string" || typeof bytes !== "number") continue;
    photos.push({ key, name, bytes });
    // El tope del dominio, aplicado también acá. Cada foto cuesta una descarga
    // y un decodificado de `sharp` dentro de una función con memoria fija.
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
 * aplicación — incluido un arreglo, que en `jsonb` es un valor posible y en
 * JavaScript pasa por `typeof "object"`. Los campos desconocidos se descartan
 * en vez de arrastrarse.
 */
export function normaliseStoredDraft(value: unknown): StoredPublicationDraft | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
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
  // Vacía se descarta en vez de guardarse: `""` y "todavía no la escribió" son
  // lo mismo para el validador, y arrastrar la cadena vacía haría que un
  // borrador recién empezado no volviera igual que como salió.
  if (typeof source.description === "string" && source.description !== "") {
    listing.description = source.description;
  }

  const violations = Array.isArray(candidate.violations)
    ? candidate.violations.filter((entry): entry is PublishViolation => typeof entry === "string")
    : [];

  const draft: StoredPublicationDraft = {
    listing: listing as StoredPublicationDraft["listing"],
    photos: readPhotos(candidate.photos),
    violations,
    ...(candidate.featuresDeclared === true ? { featuresDeclared: true } : {}),
  };

  const raw = readRaw(candidate.raw);
  return raw ? { ...draft, raw } : draft;
}
