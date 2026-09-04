import type { ListingAttribute } from "./search-criteria";

/**
 * **La dirección ES el estado de la búsqueda**, y este archivo es quien la
 * escribe (F12, F14).
 *
 * Sin JavaScript no hay estado en memoria: cada opción del acordeón es un
 * enlace `GET` que vuelve al servidor con la búsqueda entera en la query. Eso
 * es lo que hace que el conteo del botón sea real en cada paso — el servidor
 * recuenta con los filtros que la dirección trae — y lo que hace que una
 * búsqueda se pueda pegar en un WhatsApp, guardar en favoritos e indexar.
 *
 * Vive en `domain/` y no en la página por la regla permanente del fundador:
 * qué se borra al cambiar de ciudad, qué sobrevive a «Limpiar todo» y cuándo
 * se vuelve a la primera página son reglas de negocio. También por una razón
 * mecánica — el suelo de cobertura del 90 % llega a `domain/` y no llega a
 * `app/`, así que una regla escrita en la página es una regla que ninguna
 * corrida de tests puede poner en rojo.
 */

/**
 * Cada campo que una dirección de búsqueda puede llevar.
 *
 * **La ciudad no está**, y no es un olvido: la ciudad va en la RUTA
 * (`/alquiler/<ciudad>`), nunca en la query. Es lo que garantiza el
 * aislamiento entre Maracaibo y Distrito Capital y lo que hace que «Limpiar
 * todo» no pueda borrarla ni por accidente — no hay parámetro que quitar.
 */
export type SearchQueryField =
  | "zone"
  | "minPrice"
  | "maxPrice"
  | "minRooms"
  | "minBathrooms"
  | "propertyType"
  | "publisherType"
  | ListingAttribute
  | "page"
  | "step"
  | "zoneSearch"
  | "order";

/**
 * Los nombres cortos del fundador (F12), en un solo lugar.
 *
 * Estaban escritos dentro de `app/alquiler/[ciudad]/[zona]/page.tsx`. Son el
 * contrato de la dirección — una URL pegada en un chat hace meses tiene que
 * seguir significando lo mismo — y `indexing-contract.test.ts` los ata a
 * `FILTER_KEYS` para que un parámetro nuevo no se publique como una dirección
 * indexable propia.
 *
 * `filtros` es el único que no es un filtro: dice **qué paso del acordeón está
 * abierto**. Existe porque sin JavaScript cada opción navega, y el navegador
 * no puede recordar por su cuenta qué `<details>` estaba abierto al volver del
 * servidor. Aun así entra en `FILTER_KEYS`, porque una dirección con el panel
 * abierto es la misma página que sin él: indexar las dos es contenido
 * duplicado.
 */
export const SEARCH_QUERY_NAMES: Readonly<Record<SearchQueryField, string>> = {
  zone: "zona",
  minPrice: "min",
  maxPrice: "max",
  minRooms: "hab",
  // **`banos` y no `baños`** (14.45): con «ñ» la dirección viaja como
  // `ba%C3%B1os` y deja de leerse en el chat donde se pega, que es la mitad de
  // para qué existen los nombres cortos del fundador (F12).
  minBathrooms: "banos",
  propertyType: "tipo",
  publisherType: "pub",
  hasPowerPlant: "planta",
  hasRegularWater: "agua",
  isFurnished: "amoblado",
  // **`puesto` y no `estacionamiento`** (14.45 rebanada C): es la palabra que
  // la tira de datos de la ficha ya usa, y un nombre corto de F12 que hay que
  // traducir mentalmente no es corto. Sin «ñ» ni tilde, igual que `banos`.
  hasParking: "puesto",
  hasSecurity: "vigilancia",
  hasAppliances: "electro",
  page: "pag",
  step: "filtros",
  zoneSearch: "busca",
  // **El orden de la lista** (14.47). Va último a propósito: los campos se
  // agregan a la dirección en el orden de esta tabla, y el orden es lo que
  // menos define una búsqueda — la cola es su sitio.
  order: "orden",
};

/** La query tal como la entrega el marco: nombres cortos y texto crudo. */
export type SearchQuery = Readonly<Record<string, string | undefined>>;

/** Un valor nuevo, o `null` para quitar el parámetro. */
export type SearchQueryChanges = Readonly<Partial<Record<SearchQueryField, string | null>>>;

/**
 * Los cuatro campos que NO son filtros, y por lo tanto no reinician la
 * paginación ni los borra «Limpiar todo». Todo lo demás sí — ver
 * `buildSearchHref` y `clearAllHref`.
 *
 * `orden` es el que llegó con la 14.47, y no filtra por definición: **no saca
 * ni agrega un solo aviso**, sólo cambia en qué fila sale cada uno. Por eso
 * «Limpiar todo» no lo toca —limpiar filtros no es volver al orden por
 * defecto, igual que no es cerrar el panel— y por eso el reinicio de página lo
 * pide `buildOrderMenu` explícito en vez de salir de acá.
 *
 * `busca` es el texto del buscador de zonas del paso 2. **No filtra
 * resultados**: achica la lista de zonas que se ofrece, y las zonas que
 * filtran son las que se hayan tocado. Tratarlo como filtro devolvería a la
 * página 1 por escribir una letra, y lo borraría «Limpiar todo» dejando el
 * campo vacío sin que nadie lo pidiera.
 */
const NON_FILTER_FIELDS: readonly SearchQueryField[] = ["page", "step", "zoneSearch", "order"];

const FIELD_ORDER = Object.keys(SEARCH_QUERY_NAMES) as readonly SearchQueryField[];

/** Los nombres de todos los filtros, o sea todo menos la página y el paso. */
const FILTER_PARAM_NAMES: readonly string[] = FIELD_ORDER.filter(
  (field) => !NON_FILTER_FIELDS.includes(field),
).map((field) => SEARCH_QUERY_NAMES[field]);

/**
 * La misma dirección con un cambio aplicado.
 *
 * **Cambiar un filtro vuelve a la primera página, y ésa es la única decisión
 * que esta función toma sola.** Quedarse en la página 7 después de estrechar
 * la búsqueda es una pantalla vacía sin causa visible: la búsqueda nueva puede
 * tener dos páginas. Abrir un paso del acordeón o pasar de página no cuentan
 * como cambio de filtro — el primero no filtra nada y el segundo *es* la
 * paginación.
 *
 * Los parámetros que no entiende se conservan, incluidos los `utm_*` que trae
 * un enlace compartido: quitarlos sería decidir por quien armó el enlace.
 *
 * Un valor vacío es lo mismo que ausente. Es lo que deja un campo de un
 * formulario `GET` que nadie llenó, y un `?min=` colgando es un filtro
 * presente que no filtra.
 */
export function buildSearchHref(
  basePath: string,
  query: SearchQuery,
  changes: SearchQueryChanges,
): string {
  const changed = new Map<string, string | null>();
  for (const field of FIELD_ORDER) {
    const value = changes[field];
    if (value === undefined) continue;
    changed.set(SEARCH_QUERY_NAMES[field], value === "" ? null : value);
  }

  const touchesAFilter = FIELD_ORDER.some(
    (field) => changes[field] !== undefined && !NON_FILTER_FIELDS.includes(field),
  );
  // La página se cae por el cambio de filtro, salvo que el cambio SEA de
  // página — pedir la 3 con un filtro nuevo en el mismo enlace es una
  // combinación que ninguna pantalla arma, y ganar la que se pidió explícito
  // es lo menos sorprendente.
  if (touchesAFilter && changes.page === undefined) changed.set(SEARCH_QUERY_NAMES.page, null);

  const params = new URLSearchParams();
  // Primero los que ya estaban, **en su orden**: una dirección que sólo
  // reordena sus parámetros es otra cadena para la misma búsqueda, y eso son
  // dos entradas de historial y dos URLs para Google.
  for (const [key, value] of Object.entries(query)) {
    const replacement = changed.has(key) ? changed.get(key) : value;
    if (replacement === null || replacement === undefined || replacement === "") continue;
    params.set(key, replacement);
    changed.delete(key);
  }
  for (const name of FIELD_ORDER.map((field) => SEARCH_QUERY_NAMES[field])) {
    const value = changed.get(name);
    if (value === null || value === undefined || value === "") continue;
    params.set(name, value);
  }

  const search = params.toString();
  return search === "" ? basePath : `${basePath}?${search}`;
}

/**
 * **La dirección de esta pantalla de resultados, tal como viaja en el enlace a
 * un aviso** (tarea 16.9).
 *
 * `return-to-results.ts` ya decidía *si* hay una vuelta que prometer y a dónde
 * apunta; lo que faltaba, y es lo que la 16.9 pide, es **qué viaja con ella**.
 * La URL de la ficha es canónica y no lleva estado de búsqueda (11.1), así que
 * el estado se cuelga del enlace de ida — y si ese enlace lleva sólo la ruta,
 * «← Resultados» aterriza en la zona pelada. Quien había estrechado 70 avisos a
 * 9 recibe los 70 otra vez: cumple la letra y derrota el propósito.
 *
 * **Viaja la búsqueda, no el panel.** `filtros` dice qué grupo del acordeón
 * está desplegado y `busca` es el texto que achica la lista de zonas ofrecidas;
 * ninguno recorta un solo aviso. Arrastrarlos devolvería a la pantalla con el
 * modal encima — quien pidió sus resultados recibiría el panel de filtros. Es
 * la misma distinción que `NON_FILTER_FIELDS` ya traza, menos `page`: la página
 * no filtra, pero **es dónde la persona estaba parada**, y aterrizar en la 1
 * desde la 3 pierde el lugar aunque los filtros estén.
 *
 * **Vive acá y no en las dos páginas** por la regla permanente del fundador:
 * qué se lleva un enlace de vuelta es producto, no plantilla. Con su razón
 * mecánica al lado — el suelo de cobertura del 90 % llega a `domain/` y no
 * llega a `app/` —, y con una segunda: la zona y la ciudad tienen que componer
 * el MISMO origen, y dos copias de esta expresión escritas en dos páginas
 * dejan de coincidir en el próximo parámetro que alguien agregue.
 *
 * No valida: el que emite el enlace es `withResultsOrigin`, que comprueba
 * contra `safeResultsOrigin` antes de escribir nada. Acá no hay entrada de un
 * tercero — `basePath` lo afirma la ruta.
 */
export function resultsOriginHref(basePath: string, query: SearchQuery): string {
  return buildSearchHref(basePath, query, { step: null, zoneSearch: null });
}

/** Una lista separada por comas, sin vacíos ni repetidas. Traducción, no decisión. */
export function readZoneList(raw: string | null | undefined): readonly string[] {
  const kept: string[] = [];
  for (const candidate of (raw ?? "").split(",")) {
    const value = candidate.trim();
    if (value !== "" && !kept.includes(value)) kept.push(value);
  }
  return kept;
}

/**
 * Sumar o quitar una zona, **sin reemplazar las demás** (F4).
 *
 * Las zonas se combinan con O: elegir Altamira teniendo Chacao pide las dos,
 * no cambia de una a la otra. Es la diferencia entre "ampliar la búsqueda" y
 * "empezar otra", y en un mercado de seis zonas por ciudad es la operación
 * que la gente hace todo el tiempo.
 */
export function toggleZone(selected: readonly string[], zoneId: string): readonly string[] {
  return selected.includes(zoneId) ? selected.filter((id) => id !== zoneId) : [...selected, zoneId];
}

/**
 * «Limpiar todo»: todo vuelve al valor por defecto **menos la ciudad** (F8).
 *
 * La ciudad es el contexto de la búsqueda y no un filtro, así que la dirección
 * resultante es la ruta de la ciudad — y como la ciudad vive en la ruta, no
 * hay forma de que esta función la borre aunque alguien lo intente.
 *
 * **La zona SÍ se suelta, incluida la de la ruta.** Por eso el argumento es la
 * ruta de la ciudad y no la actual: desde `/alquiler/distrito-capital/chacao`
 * limpiar deja `/alquiler/distrito-capital`. Que la zona esté en el camino y
 * no en la query es una decisión de direcciones, no un ascenso a contexto.
 *
 * El paso abierto del acordeón sobrevive: limpiar no es cerrar, y cerrarle el
 * panel a quien acaba de vaciarlo lo obliga a abrirlo otra vez para seguir.
 */
export function clearAllHref(cityPath: string, query: SearchQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    if (key === SEARCH_QUERY_NAMES.page || FILTER_PARAM_NAMES.includes(key)) continue;
    params.set(key, value);
  }

  const search = params.toString();
  return search === "" ? cityPath : `${cityPath}?${search}`;
}
