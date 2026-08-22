import { readPage } from "./pagination";

/**
 * What a search IS, decided before anything touches the database
 * (tasks.md 5.0/5.1, design.md D5).
 *
 * Query parameters arrive as text a visitor can hand-edit and as state a
 * GET form kept from the previous page; this turns that into the only shape
 * `ListingSearchPort.search` accepts.
 *
 * **The stale-zone rule is why this exists as a separate step.**
 * `components/molecules/CityZoneSelect.tsx` records the mechanism: a GET
 * form submits whatever its controls currently hold, so switching city
 * without touching the zone select sends the *previous* city's zone —
 * `?city=<maracaibo>&zone=<a caracas zone>`. Nothing is written, so D5's
 * composite foreign key is not involved and cannot help. Passing that pair
 * to SQL would be technically correct and a product failure: `city_id = A
 * AND zone_id = B` matches nothing, and the visitor sees an empty page for
 * a city full of listings with no way to tell why. The zone is dropped,
 * because the city is what they just chose and the zone is leftover state
 * they never saw.
 *
 * **Todo lo que llega acá se descarta campo por campo, nunca de a bloques**
 * (tasks 14.6 a 14.10). Es la misma regla de la zona vieja llevada al resto
 * de los filtros: un parámetro viejo pegado de un WhatsApp de hace un mes
 * pierde ese filtro y ni uno más. Una URL entera rechazada por un `tipo` que
 * ya no existe es una página vacía que nadie puede explicar.
 */

/** The five declared attributes of F6, by the name the schema gives them. */
export type ListingAttribute =
  | "hasPowerPlant"
  | "hasRegularWater"
  | "isFurnished"
  | "hasSecurity"
  | "hasAppliances";

export type PublisherType = "owner" | "broker";

/** Los cinco tipos que `listing.property_type` admite (task 14.8). */
export type SearchablePropertyType = "apartamento" | "casa" | "quinta" | "anexo" | "habitacion";

export interface CuratedZone {
  readonly id: string;
  readonly cityId: string;
}

/**
 * Query parameters, exactly as a URL hands them over.
 *
 * Los nombres son los del dominio, no los cortos de la URL (F12: `min`,
 * `max`, `hab`, `zona`, `tipo`, `pag`). El renombre pasa en el borde de
 * entrega — la página de resultados — y por eso este traductor no sabe nada
 * de cómo se llaman los parámetros ahí afuera.
 */
export interface RawSearchParams {
  readonly city?: string | null;
  /**
   * Una zona, o **varias separadas por coma** (task 14.6, F4). Un solo id es
   * el caso de una lista de uno, así que no hay dos formas de escribirlo.
   */
  readonly zone?: string | null;
  readonly minPrice?: string | null;
  readonly maxPrice?: string | null;
  readonly minRooms?: string | null;
  readonly minAreaM2?: string | null;
  readonly propertyType?: string | null;
  readonly publisherType?: string | null;
  readonly hasPowerPlant?: string | null;
  readonly hasRegularWater?: string | null;
  readonly isFurnished?: string | null;
  readonly hasSecurity?: string | null;
  readonly hasAppliances?: string | null;
  readonly page?: string | null;
}

/**
 * `cityId` is required and non-nullable — D5's second layer. Every other
 * field is optional, so a criteria object that exists is always scoped to
 * exactly one city; there is no value to pass that means "everywhere".
 */
export interface SearchCriteria {
  readonly cityId: string;
  /**
   * Varias zonas **combinadas con O** (task 14.6, F4): un aviso entra si está
   * en cualquiera de ellas. Ausente significa toda la ciudad; nunca llega
   * vacía, porque una lista vacía sería un filtro presente que no filtra —
   * y un `IN ()` del lado del SQL.
   */
  readonly zoneIds?: readonly string[];
  readonly minPriceUsd?: number;
  readonly maxPriceUsd?: number;
  readonly minRooms?: number;
  readonly minAreaM2?: number;
  readonly propertyType?: SearchablePropertyType;
  readonly publisherType?: PublisherType;
  /**
   * Los atributos declarados, **combinados con Y** (task 14.9): pedir planta
   * y agua es pedir los dos, no cualquiera de los dos.
   *
   * **Sólo se puede pedir el `true`, y eso es deliberado.** En el esquema
   * `false` significa "no lo declaró", nunca "no lo tiene": las cinco
   * columnas son `NOT NULL DEFAULT false`, así que todo aviso publicado antes
   * de que existiera la casilla vale `false` sin que nadie haya afirmado
   * nada. Un filtro por `false` devolvería avisos que sí tienen planta y no la
   * anotaron — afirmaría en nombre del sistema algo que el sistema no sabe.
   * Por eso el criterio es una lista de atributos exigidos y no un mapa de
   * booleanos: la forma misma hace inexpresable el filtro que mentiría.
   */
  readonly attributes?: readonly ListingAttribute[];
  /**
   * La página pedida, base 1. Ausente es la primera — ver `pagination.ts`,
   * que es donde vive el tamaño de página y la aritmética entera.
   */
  readonly page?: number;
}

/** Whole, non-negative, and actually a number. Anything else is noise. */
function readCount(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
}

/**
 * Las listas cerradas como `Record<…, true>` y no como arreglos: a un
 * `Record` completo le falta una clave y **no compila**, así que un sexto
 * tipo de propiedad en el esquema se ve acá en vez de quedar como una opción
 * que el filtro nunca puede pedir.
 */
const PROPERTY_TYPES: Readonly<Record<SearchablePropertyType, true>> = {
  apartamento: true,
  casa: true,
  quinta: true,
  anexo: true,
  habitacion: true,
};

const PUBLISHER_TYPES: Readonly<Record<PublisherType, true>> = { owner: true, broker: true };

/**
 * Los mismos cinco tipos, en el orden en que se ofrecen. Exportado para que
 * el formulario dibuje exactamente los que el filtro puede pedir: una lista
 * escrita a mano en un componente es una opción de más que no filtra nada, o
 * una de menos que nadie puede elegir.
 */
export const SEARCHABLE_PROPERTY_TYPES = Object.keys(
  PROPERTY_TYPES,
) as readonly SearchablePropertyType[];

/**
 * El orden en que se leen los atributos, y por lo tanto el orden en que
 * quedan en el criterio. Fijo a propósito: dos URLs con las mismas casillas
 * marcadas producen el mismo criterio, y el mismo criterio produce el mismo
 * SQL.
 */
export const LISTING_ATTRIBUTES: readonly ListingAttribute[] = [
  "hasPowerPlant",
  "hasRegularWater",
  "isFurnished",
  "hasSecurity",
  "hasAppliances",
];

/**
 * Pertenencia a una lista cerrada, con `Object.hasOwn` y no con `in`: `in`
 * encuentra `constructor` y `toString` en el prototipo, así que `?tipo=
 * constructor` pasaría por un tipo de propiedad válido.
 */
function readChoice<T extends string>(
  raw: string | null | undefined,
  allowed: Readonly<Record<T, true>>,
): T | undefined {
  if (raw === null || raw === undefined) return undefined;
  const value = raw.trim();
  return Object.hasOwn(allowed, value) ? (value as T) : undefined;
}

/**
 * Una casilla marcada. `"1"` es lo que este formulario manda; `"on"` es lo
 * que manda una casilla HTML sin `value` propio, y aceptarlo evita que
 * quitar un atributo del `value` apague el filtro en silencio.
 *
 * Nada más cuenta, y en particular **nada significa "false"**: no existe un
 * valor que pida los avisos que declararon que NO — ver `attributes` arriba.
 */
function readFlag(raw: string | null | undefined): true | undefined {
  if (raw === null || raw === undefined) return undefined;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "on" ? true : undefined;
}

/**
 * Las zonas que sobreviven, en el orden en que llegaron y sin repetir.
 *
 * Cada id se juzga solo: la que no pertenece a esta ciudad o ya no existe en
 * la taxonomía se cae, y las demás siguen. Perder la búsqueda entera por una
 * zona vieja sería una página vacía sin explicación; perder esa zona es una
 * búsqueda más ancha que la pedida, y eso el visitante lo ve.
 */
function readZoneIds(
  raw: string | null | undefined,
  cityId: string,
  zones: readonly CuratedZone[],
): readonly string[] | undefined {
  if (raw === null || raw === undefined) return undefined;

  const kept: string[] = [];
  for (const candidate of raw.split(",")) {
    const zoneId = candidate.trim();
    if (zoneId === "" || kept.includes(zoneId)) continue;
    if (zones.some((zone) => zone.id === zoneId && zone.cityId === cityId)) kept.push(zoneId);
  }

  return kept.length === 0 ? undefined : kept;
}

/** Los atributos exigidos, o `undefined` si no hay ninguno. */
function readAttributes(raw: RawSearchParams): readonly ListingAttribute[] | undefined {
  const asked = LISTING_ATTRIBUTES.filter((attribute) => readFlag(raw[attribute]) === true);
  return asked.length === 0 ? undefined : asked;
}

/**
 * `null` means **no search happened** — not "search every city". A visitor
 * who has not picked a city yet gets the city chooser, and this is the only
 * representable way to say that: there is no criteria object without a
 * scope, so no caller can accidentally construct an unscoped query.
 *
 * `zones` may be the entire curated taxonomy; membership is checked against
 * the submitted `cityId` here rather than trusting a pre-filtered list.
 * A caller that filtered by the wrong city would otherwise re-open exactly
 * the hole this function closes.
 *
 * OPEN QUESTION, recorded rather than hidden: a *silently* dropped zone is
 * the least-bad default, not a good one. The results page should say
 * "mostrando toda la ciudad" when it happens, and this signature gives it
 * no way to know. A `droppedZone` flag is the obvious fix, left for 5.7's
 * UI rather than guessed at before it has a reader.
 */
export function buildSearchCriteria(
  raw: RawSearchParams,
  zones: readonly CuratedZone[],
): SearchCriteria | null {
  const cityId = raw.city?.trim();
  if (!cityId) return null;

  return {
    cityId,
    ...maybe("zoneIds", readZoneIds(raw.zone, cityId, zones)),
    ...maybe("minPriceUsd", readCount(raw.minPrice)),
    ...maybe("maxPriceUsd", readCount(raw.maxPrice)),
    ...maybe("minRooms", readCount(raw.minRooms)),
    ...maybe("minAreaM2", readCount(raw.minAreaM2)),
    ...maybe("propertyType", readChoice(raw.propertyType, PROPERTY_TYPES)),
    ...maybe("publisherType", readChoice(raw.publisherType, PUBLISHER_TYPES)),
    ...maybe("attributes", readAttributes(raw)),
    ...maybe("page", readPage(raw.page)),
  };
}

/** Keeps absent filters absent instead of present-and-undefined. */
function maybe<K extends string, V>(key: K, value: V | undefined) {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
