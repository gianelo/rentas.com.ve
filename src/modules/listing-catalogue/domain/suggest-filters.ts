import { slugify } from "../../listing-discovery/domain/listing-url";

/**
 * Traduce lo que alguien escribe en **filtros**, no en una búsqueda de texto.
 *
 * **Esa distinción es la que hace que esto no contradiga la exclusión de
 * "búsqueda de texto libre" del propio documento del fundador.** Aquella
 * exclusión tenía una razón medida: *"con 47 avisos devuelve vacío casi siempre
 * y el sitio parece vacío"*. Acá nunca se leen títulos ni descripciones de
 * avisos — se compara contra un vocabulario cerrado y se emiten filtros. Por
 * eso **no puede devolver vacío por falta de oferta**: no busca oferta.
 *
 * Es el mismo mecanismo que la F4 ya pedía ("sólo autocompleta zonas
 * conocidas"), con el vocabulario ensanchado a ciudades, tipos, precios,
 * habitaciones y atributos.
 *
 * Puro: entra texto y un vocabulario, salen sugerencias. Sin base, sin red.
 */

export interface SuggestionVocabulary {
  readonly cities: ReadonlyArray<{ id: string; name: string }>;
  readonly zones: ReadonlyArray<{
    id: string;
    name: string;
    cityId: string;
    /** La parroquia o el municipio. Es lo que desambigua un nombre repetido. */
    parentName: string | null;
  }>;
  /**
   * Los alias del «Índice de topónimos». Son 3.547 en el corpus real, y son lo
   * que hace que escribir «Bella Vista» encuentre la entrada que la fuente
   * publica como «Oficina Postal Telegráfica Bella Vista».
   */
  readonly aliases: ReadonlyArray<{ zoneId: string; alias: string }>;
}

export type SuggestionKind =
  | "city"
  | "zone"
  | "propertyType"
  | "maxPrice"
  | "rooms"
  | "feature"
  | "publisherType";

export interface FilterSuggestion {
  readonly kind: SuggestionKind;
  /** El valor que va al filtro. */
  readonly id: string;
  /** Lo que se muestra. */
  readonly label: string;
  /**
   * De dónde es, cuando hace falta para distinguirla.
   *
   * **Sin esto, una sugerencia miente.** `Centro` existe en Maracaibo y en
   * Caracas; ofrecer sólo "Centro" aplicaría el filtro de la ciudad equivocada,
   * y el visitante se llevaría cero resultados sin entender por qué — porque el
   * aislamiento de ciudad es una garantía dura de la base de datos, no un
   * filtro que se pueda aflojar.
   */
  readonly scope: string | null;
}

/** Palabras que el sitio entero cumple, así que no distinguen nada. */
const STOPWORDS = new Set([
  "alquiler",
  "alquilar",
  "arriendo",
  "arrendar",
  "rentar",
  "renta",
  "en",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "con",
  "para",
  "por",
]);

const PROPERTY_TYPES: ReadonlyArray<[string, string]> = [
  ["apartamento", "Apartamento"],
  ["apto", "Apartamento"],
  ["casa", "Casa"],
  ["quinta", "Quinta"],
  ["anexo", "Anexo"],
  ["habitacion", "Habitación"],
  ["cuarto", "Habitación"],
];

const PROPERTY_TYPE_IDS: Record<string, string> = {
  Apartamento: "apartamento",
  Casa: "casa",
  Quinta: "quinta",
  Anexo: "anexo",
  Habitación: "habitacion",
};

const FEATURES: ReadonlyArray<[string, string]> = [
  ["planta", "Planta eléctrica"],
  ["amoblado", "Amoblado"],
  ["amueblado", "Amoblado"],
  ["vigilancia", "Vigilancia 24 h"],
  ["agua", "Agua regular"],
  ["linea-blanca", "Línea blanca"],
];

const FEATURE_IDS: Record<string, string> = {
  "Planta eléctrica": "hasPowerPlant",
  "Agua regular": "hasRegularWater",
  Amoblado: "isFurnished",
  "Vigilancia 24 h": "hasSecurity",
  "Línea blanca": "hasAppliances",
};

/**
 * `hasta 400`, `menos de 400`, `maximo 400`, `hasta $400`.
 *
 * Se aplica sobre el texto YA normalizado, donde los espacios son guiones y el
 * signo de peso desapareció -- por eso busca guiones y no \s. Escribir la
 * expresión contra el texto crudo sería la clase de error que pasa los tests de
 * una frase y falla con la siguiente.
 */
const MAX_PRICE = /(?:hasta|menos-de|maximo|max)-(\d{2,6})/u;

/** `2 habitaciones`, `2 hab`, `3 cuartos`. Sobre el texto normalizado. */
const ROOMS = /(\d)-(?:habitaciones|habitacion|hab|cuartos|cuarto)(?:-|$)/u;

/**
 * Normaliza como lo hace el resto del producto: **reusa `slugify`**, que ya
 * quita acentos con NFD y baja a minúsculas. Escribir un segundo normalizador
 * acá es cómo dos partes del sistema empiezan a discrepar sobre si «Chacao» y
 * «chacao» son la misma palabra.
 */
function normalize(value: string): string {
  return slugify(value);
}

function matches(haystack: string, needle: string): boolean {
  const target = normalize(haystack);
  return target !== "" && needle.includes(target);
}

export function suggestFilters(
  text: string,
  vocabulary: SuggestionVocabulary,
): readonly FilterSuggestion[] {
  const normalized = normalize(text);
  if (normalized === "") return [];

  // Las palabras de relleno se quitan sólo para decidir si quedó algo que
  // buscar; el texto completo se sigue usando para las coincidencias, porque
  // «hasta 400» es dos palabras y una de ellas es corta.
  const meaningful = normalized.split("-").filter((word) => word !== "" && !STOPWORDS.has(word));
  if (meaningful.length === 0) return [];

  const suggestions: FilterSuggestion[] = [];
  const seen = new Set<string>();

  const push = (suggestion: FilterSuggestion): void => {
    const key = `${suggestion.kind}|${suggestion.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(suggestion);
  };

  for (const city of vocabulary.cities) {
    if (matches(city.name, normalized)) {
      push({ kind: "city", id: city.id, label: city.name, scope: null });
    }
  }

  // Los alias primero: son el nombre por el que la gente busca, y encontrarlos
  // antes hace que la zona aparezca aunque su nombre publicado sea otro.
  const zoneById = new Map(vocabulary.zones.map((zone) => [zone.id, zone]));
  for (const { zoneId, alias } of vocabulary.aliases) {
    const zone = zoneById.get(zoneId);
    if (zone && matches(alias, normalized)) {
      push({ kind: "zone", id: zone.id, label: alias, scope: zone.parentName });
    }
  }

  for (const zone of vocabulary.zones) {
    if (matches(zone.name, normalized)) {
      push({ kind: "zone", id: zone.id, label: zone.name, scope: zone.parentName });
    }
  }

  for (const [term, label] of PROPERTY_TYPES) {
    if (normalized.includes(term)) {
      push({ kind: "propertyType", id: PROPERTY_TYPE_IDS[label] ?? label, label, scope: null });
    }
  }

  for (const [term, label] of FEATURES) {
    if (normalized.includes(term)) {
      push({ kind: "feature", id: FEATURE_IDS[label] ?? label, label, scope: null });
    }
  }

  const price = MAX_PRICE.exec(normalized);
  if (price?.[1]) {
    push({
      kind: "maxPrice",
      id: price[1],
      label: `Hasta $${price[1]} al mes`,
      scope: null,
    });
  }

  const rooms = ROOMS.exec(normalized);
  if (rooms?.[1]) {
    push({ kind: "rooms", id: rooms[1], label: `${rooms[1]} habitaciones`, scope: null });
  }

  if (normalized.includes("dueno")) {
    push({ kind: "publisherType", id: "owner", label: "Solo de dueños", scope: null });
  }

  return suggestions;
}
