import { readPage } from "./pagination";
import { readSearchOrder, type SearchOrder } from "./search-order";
import { zoneMatchesToken } from "./zone-catalogue";

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

/**
 * **Las cinco columnas booleanas del aviso**, por el nombre que les da el
 * esquema. Es el vocabulario de las COLUMNAS, no el de las opciones: `false`
 * ahí significa "no lo declaró" y sólo un `boolean` puede decir eso.
 *
 * Se usa donde de verdad hace falta una columna booleana —los mapas
 * `Record<DeclaredAttribute, PgColumn>` de los dos adaptadores— y en ningún
 * otro lado. Ese `Record` es el que se rompería si alguien intentara meter
 * una derivada adentro, que es exactamente lo que tiene que pasar.
 */
export type DeclaredAttribute =
  | "hasPowerPlant"
  | "hasRegularWater"
  | "isFurnished"
  | "hasSecurity"
  | "hasAppliances";

/**
 * **Una opción del grupo «La propiedad tiene» del filtro.** Son seis: las
 * cinco columnas booleanas más el puesto de estacionamiento (14.45 rebanada
 * C), que **no es una columna nueva** sino `listing.parking_spots > 0` leído
 * como sí/no.
 *
 * **LA ELECCIÓN DE FORMA, ESCRITA CON SU RAZÓN.** `LISTING_ATTRIBUTES` era una
 * lista de claves booleanas del aviso, y meterle una derivada obligaba a
 * decidir entre dos formas: que la lista pase a ser de **opciones de filtro**,
 * o que la derivada **viva al lado** de las cinco. Pasa a ser de opciones, y
 * la razón es mecánica y no de gusto.
 *
 * Todo lo que este filtro necesita saber de sus opciones está escrito como
 * `Record<ListingAttribute, …>`: la etiqueta (`search-options.ts`), el nombre
 * corto de la dirección (`search-query.ts`), el nombre y el orden de la
 * relajación (`search-confirm.ts`), el resumen del renglón cerrado
 * (`search-accordion.ts`) y el conteo real (`FacetCounts.byAttribute`). A un
 * `Record` completo le falta una clave y **no compila**. Con la sexta adentro
 * del tipo, agregarla es imposible de dejar a medias: el compilador nombra los
 * cinco lugares que faltan. Viviendo al lado, serían cinco agregados a mano
 * que nada comprueba — la misma clase de hueco silencioso que la 14.48
 * documenta en `lint:tokens` y que la 14.42 llama «un gate en verde que no
 * protege nada».
 *
 * Lo que se pierde al ensanchar la lista —que cada clave tuviera su columna
 * booleana— se recupera entero en `DeclaredAttribute`, que es lo que los
 * adaptadores siguen exigiendo donde una columna es lo que de verdad hace
 * falta. Las dos garantías quedan, cada una en el tipo que le corresponde.
 */
export type ListingAttribute = DeclaredAttribute | "hasParking";

export type PublisherType = "owner" | "broker";

/** Los cinco tipos que `listing.property_type` admite (task 14.8). */
export type SearchablePropertyType = "apartamento" | "casa" | "quinta" | "anexo" | "habitacion";

export interface CuratedZone {
  readonly id: string;
  readonly cityId: string;
  /**
   * El nombre legible con el que la zona viaja en `?zona=` (F12). Lo calcula
   * `toSearchZones`; acá sólo se compara. El `id` sigue siendo la clave.
   */
  readonly slug: string;
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
  readonly minBathrooms?: string | null;
  readonly minAreaM2?: string | null;
  readonly propertyType?: string | null;
  readonly publisherType?: string | null;
  readonly hasPowerPlant?: string | null;
  readonly hasRegularWater?: string | null;
  readonly isFurnished?: string | null;
  readonly hasParking?: string | null;
  readonly hasSecurity?: string | null;
  readonly hasAppliances?: string | null;
  readonly page?: string | null;
  /** El token de `?orden=` — ver `search-order.ts` (14.47). */
  readonly order?: string | null;
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
  /**
   * **Un mínimo, y por eso el «3+» del control no es adorno** (14.45, lámina
   * 7b). El escalón `3` pide tres baños o más, exactamente como `minRooms: 4`
   * pide cuatro habitaciones o más. Escrito como mínimo y no como número
   * exacto porque es lo que la gente busca —"que tenga al menos dos"— y porque
   * un filtro exacto escondería el aviso de tres baños de quien pidió dos.
   */
  readonly minBathrooms?: number;
  /**
   * **La superficie mínima en m², escrita a mano y no elegida de una lista**
   * (14.45 rebanada B, decisión del fundador 2026-09-04: *«hay casas que tienen
   * 72,5 o 84 y así no puede ser preseleccionado»*).
   *
   * Un escalón es una lista cerrada y la superficie es un continuo: cualquier
   * corte deja a alguien afuera de su propia casa. Por eso este criterio —que
   * existe desde hace tiempo— nunca tuvo escalones que resolver: la forma que
   * siempre esperó es un mínimo suelto, «desde X m²».
   *
   * **Y por eso no tiene faceta.** Con un campo libre no hay opciones que
   * contar, así que la regla transversal 3 («todo conteo es real») se cumple del
   * otro lado: el número real es el total de resultados, que la pantalla ya
   * muestra. Sí se puede contar cuántos habría al SOLTARLO, y eso es
   * `withoutFilter.area`.
   */
  readonly minAreaM2?: number;
  readonly propertyType?: SearchablePropertyType;
  readonly publisherType?: PublisherType;
  /**
   * Los atributos declarados, **combinados con Y** (task 14.9): pedir planta
   * y agua es pedir los dos, no cualquiera de los dos.
   *
   * **La sexta, el puesto de estacionamiento, es DERIVADA y no un booleano
   * más** (14.45 rebanada C, decisión del fundador): sale de
   * `listing.parking_spots > 0`, una columna que ya existe y que el paso 4 de
   * publicar ya escribe. Un `hasParking` booleano al lado guardaría el mismo
   * hecho dos veces, y dos copias del mismo hecho se contradicen —
   * `parking_spots = 0` con `hasParking = true` sería una fila que el esquema
   * permitiría y nadie podría arbitrar. Es el argumento con el que la 14.36
   * mató el paso de ciudad y la 14.50 el abanico de conteos.
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
  /**
   * **En qué orden sale la lista** (14.47). Ausente es «Recientes», igual que
   * `page` ausente es la primera: el orden por defecto no se representa, así
   * que no hay dos formas de pedirlo ni una búsqueda vieja que cambie de forma.
   *
   * El orden NO filtra —no saca ni agrega un aviso— y por eso no participa de
   * ningún conteo: las facetas devuelven lo mismo con cualquiera de los tres.
   */
  readonly order?: SearchOrder;
}

/**
 * Un precio de la dirección, leído con **exactamente la misma regla** que el
 * criterio. Lo lee `price-correction.ts` (14.13): un segundo lector más
 * permisivo anunciaría la corrección de un filtro que `buildSearchCriteria`
 * había descartado sin aplicar.
 */
export function readPriceUsd(raw: string | null | undefined): number | undefined {
  return readCount(raw);
}

/** Whole, non-negative, and actually a number. Anything else is noise. */
function readCount(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
}

/**
 * **El techo de un `integer` de Postgres**, que es el tipo de `listing.area_m2`
 * (`schema.ts`). No es un límite de producto inventado: por encima de esto el
 * parámetro no entra en la columna y la consulta revienta, así que `?metros=1e21`
 * sería un 500 en vez de una pantalla.
 */
const PG_INTEGER_MAX = 2147483647;

/**
 * **La superficie mínima, que es el único filtro que se ESCRIBE** (14.45
 * rebanada B). Los otros números del panel salen de listas cerradas y sólo se
 * ensucian editando la dirección; éste se teclea, así que se valida acá y no
 * en el control — hay tres entradas (el campo, una dirección pegada de un chat
 * y el formulario que la reenvía) y una regla escrita en el componente cubre
 * una sola.
 *
 * Tres negativas y cada una tiene su motivo:
 *
 * - **Lo que no es un entero no negativo** se cae con `readCount`, igual que
 *   todo lo demás. Los `72,5` del fundador entran ahí: la columna es `integer`
 *   y un mínimo fraccionario no se puede devolver escrito en el campo, así que
 *   se suelta el filtro en vez de redondear en silencio algo que nadie pidió.
 * - **El cero**, porque `area_m2` es positivo en todo aviso publicable: «desde
 *   0 m²» no saca a nadie y aun así dibujaría su ficha quitable y sumaría uno a
 *   la pastilla. Un filtro presente que no filtra.
 * - **Lo que no cabe en la columna**, que `readCount` deja pasar porque `1e21`
 *   sí es un entero para JavaScript. Fallar cerrado es soltarlo (AGENTS.md §7).
 *
 * Un mínimo enorme que SÍ cabe se acepta: es una búsqueda vacía legítima, y el
 * vacío ya tiene su salida contada —«Quitar los metros² y ver 23»— que es la
 * respuesta honesta y la misma que el precio ya da.
 */
function readMinAreaM2(raw: string | null | undefined): number | undefined {
  const value = readCount(raw);
  if (value === undefined || value === 0 || value > PG_INTEGER_MAX) return undefined;
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
  // **El puesto va cuarto porque ahí lo pone el diseño**, no por orden de
  // llegada: «Rentas - UX movil.md» F6 escribe los interruptores como planta
  // eléctrica, agua regular, amoblado, puesto de estacionamiento, vigilancia
  // 24 h, línea blanca. Ponerlo al final por ser el último construido sería
  // inventar una pantalla (AGENTS.md §2).
  "hasParking",
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
 * Cada valor se juzga solo: el que no pertenece a esta ciudad o ya no existe en
 * la taxonomía se cae, y los demás siguen. Perder la búsqueda entera por una
 * zona vieja sería una página vacía sin explicación; perder esa zona es una
 * búsqueda más ancha que la pedida, y eso el visitante lo ve.
 *
 * **Se aceptan el slug y el id, y se devuelve siempre el id.** El slug es la
 * forma canónica y la única que el panel emite; el id se sigue reconociendo
 * porque ya hay direcciones con ids compartidas por WhatsApp desde que existe
 * la selección múltiple, y la dirección ES el estado de la búsqueda (F12).
 * `zoneMatchesToken` documenta por qué las dos formas no pueden chocar.
 */
function readZoneIds(
  raw: string | null | undefined,
  cityId: string,
  zones: readonly CuratedZone[],
): readonly string[] | undefined {
  if (raw === null || raw === undefined) return undefined;

  const kept: string[] = [];
  for (const piece of raw.split(",")) {
    const token = piece.trim();
    // El recorte por ciudad es la mitad de la regla: «Centro» existe en
    // Maracaibo y en Distrito Capital, y el slug solo no las distingue.
    const zone = zones.find(
      (candidate) => candidate.cityId === cityId && zoneMatchesToken(candidate, token),
    );
    if (zone && !kept.includes(zone.id)) kept.push(zone.id);
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

  const [minPriceUsd, maxPriceUsd] = orderPrices(readCount(raw.minPrice), readCount(raw.maxPrice));

  return {
    cityId,
    ...maybe("zoneIds", readZoneIds(raw.zone, cityId, zones)),
    ...maybe("minPriceUsd", minPriceUsd),
    ...maybe("maxPriceUsd", maxPriceUsd),
    ...maybe("minRooms", readCount(raw.minRooms)),
    ...maybe("minBathrooms", readCount(raw.minBathrooms)),
    ...maybe("minAreaM2", readMinAreaM2(raw.minAreaM2)),
    ...maybe("propertyType", readChoice(raw.propertyType, PROPERTY_TYPES)),
    ...maybe("publisherType", readChoice(raw.publisherType, PUBLISHER_TYPES)),
    ...maybe("attributes", readAttributes(raw)),
    ...maybe("page", readPage(raw.page)),
    ...maybe("order", omitDefaultOrder(readSearchOrder(raw.order))),
  };
}

/**
 * **Los dos extremos del precio, en orden — y al revés se intercambian, no se
 * rechazan** (F5, textual: "si el mínimo supera al máximo, se intercambian en
 * vez de dar error").
 *
 * Un `min` mayor que el `max` no es una búsqueda inválida, es un tipeo: en SQL
 * da cero filas y produce una pantalla vacía sin ninguna causa visible. Se
 * responde a lo que la persona quiso decir, que es el rango entre los dos
 * números que escribió.
 *
 * Está acá y no en el formulario del filtro porque las entradas son tres — el
 * acordeón del teléfono, la barra lateral de escritorio y una dirección pegada
 * de un chat — y una regla escrita en un componente sólo cubre la primera.
 */
function orderPrices(
  min: number | undefined,
  max: number | undefined,
): readonly [number | undefined, number | undefined] {
  // Con un solo extremo no hay nada que comparar, y con dos iguales tampoco:
  // eso es un precio exacto, no un error.
  if (min === undefined || max === undefined || min <= max) return [min, max];
  return [max, min];
}

/**
 * «Recientes» se representa como ausencia, tanto acá como en la dirección
 * (`SEARCH_ORDER_TOKENS`). Las dos ausencias son la misma decisión mirada de
 * los dos lados: una sola forma de decir el orden por defecto.
 */
function omitDefaultOrder(order: SearchOrder): SearchOrder | undefined {
  return order === "recent" ? undefined : order;
}

/** Keeps absent filters absent instead of present-and-undefined. */
function maybe<K extends string, V>(key: K, value: V | undefined) {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}
