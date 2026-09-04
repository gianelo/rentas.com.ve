import { bathroomStepLabel, isBathroomStep } from "./bathroom-steps";
import { isRoomStep, roomStepLabel } from "./room-steps";
import type { RelaxableFilter } from "./search-confirm";
import type { ListingAttribute, PublisherType, SearchCriteria } from "./search-criteria";

/**
 * **Los cuatro grupos del panel de filtros, y qué dice cada uno cerrado.**
 *
 * Eran seis cosas en cuatro pasos —ciudad, zona, precio, habitaciones— y hoy
 * son cuatro grupos: **precio, habitaciones, quién publica y atributos**. Dos
 * decisiones lo dejaron así, y ninguna es cosmética:
 *
 * - **La 14.36 sacó ciudad y zona.** La ubicación vive SOLO en la ruta y los
 *   filtros SOLO en la query; el buscador de la pastilla la resuelve por texto.
 *   Tenerla en los dos lugares *era* el problema (lámina 7b).
 * - **La 14.32 partió el paso «habitaciones»**, que llevaba adentro los
 *   escalones, el publicador y los cinco atributos. La lámina 7b los dibuja
 *   como encabezados propios en tres columnas de 800 px, y el fundador los
 *   nombra por separado: *"precio, tamaño, quién publica y atributos"*.
 *
 * **La secuencia es del teléfono y de nadie más.** El acordeón existe porque en
 * 360 px no cabe nada más (documento maestro, §7), no porque sea mejor: en
 * 1280 los cuatro grupos se ven a la vez. Por eso los grupos son una regla del
 * dominio y no una lista de secciones en un componente — la pantalla ancha y la
 * angosta dibujan el MISMO conjunto y tienen que coincidir en qué se eligió,
 * qué falta y cómo se resume. **Un solo componente con punto de quiebre, nunca
 * dos implementaciones**: es lo que `SearchFilters` dejó escrito y lo que el
 * `Nav` de la 14.40 volvió a aplicar.
 *
 * Lo que este archivo NO decide: cuántos resultados hay. Eso lo dice
 * `FacetedSearchPort`, con los números reales de la base (regla transversal 3).
 * Acá sólo vive la forma del grupo y su resumen.
 */

/**
 * Los ids son los que viajan en la dirección (`?filtros=precio`), y por eso
 * están en español: son parte del contrato de la URL, igual que `min`, `max` y
 * `hab`.
 */
export type SearchStepId = "precio" | "habitaciones" | "publica" | "atributos";

/**
 * El orden es la regla: precio, habitaciones, quién publica, atributos.
 *
 * No es estético. El precio va primero porque es el filtro que la gente pone
 * primero y el que más recorta; las habitaciones después porque es la otra
 * decisión dura; quién publica y los atributos al final porque son preferencias
 * y no requisitos — quien llega hasta ahí ya acotó la oferta a algo mirable.
 */
export const SEARCH_STEPS: readonly SearchStepId[] = [
  "precio",
  "habitaciones",
  "publica",
  "atributos",
];

/** Lista cerrada como `Record` para que un grupo nuevo no compile sin su copia. */
const STEP_COPY: Readonly<Record<SearchStepId, { title: string; question: string }>> = {
  precio: { title: "Precio", question: "¿Cuánto podés pagar al mes?" },
  habitaciones: { title: "Habitaciones", question: "¿Cuántas habitaciones?" },
  publica: { title: "Quién publica", question: "¿Quién publica el aviso?" },
  atributos: { title: "La propiedad tiene", question: "¿Qué tiene que tener?" },
};

/**
 * El valor con el que el filtro de la pastilla abre el panel **sin fijar ningún
 * grupo**.
 *
 * No es un grupo: es "abrilo y decidí vos cuál conviene". Sin él, la pastilla
 * tendría que nombrar uno —«precio», siempre el mismo— y el acordeón del
 * teléfono perdería lo único que lo hace avanzar solo, que es abrir el primero
 * sin contestar.
 */
export const PANEL_OPEN_TOKEN = "todos";

/**
 * Lo que se dice cuando la dirección pide un grupo que ya no existe.
 *
 * Es el enlace de `?filtros=zona` pegado en un chat antes de la 14.36. **Se
 * ignora con un aviso en vez de romper la página** (14.23b): un 404 —o un panel
 * que no abre— castiga a alguien por una dirección que era válida cuando la
 * compartió.
 */
export const STALE_FILTER_GROUP_NOTICE =
  "Esa dirección pedía un grupo de filtros que ya no existe. El panel se abrió igual.";

/** Lo elegido hasta ahora, en la forma en que se muestra. */
export interface SearchSelection {
  /** Siempre presente: la ciudad la afirma la ruta, nunca la query. */
  readonly cityName: string;
  /** Vacío significa "toda la ciudad", nunca "ninguna". */
  readonly zoneNames: readonly string[];
  readonly minPriceUsd?: number;
  readonly maxPriceUsd?: number;
  readonly minRooms?: number;
  readonly minBathrooms?: number;
  readonly minAreaM2?: number;
  readonly attributes?: readonly ListingAttribute[];
  readonly publisherType?: PublisherType;
}

export interface SearchStepView {
  readonly id: SearchStepId;
  /** 1 a 4, como los rotula la lámina. Sale de la lista, no de una constante. */
  readonly position: number;
  readonly title: string;
  readonly question: string;
  /** Lo que el paso muestra cerrado. Nunca vacío: siempre dice algo. */
  readonly summary: string;
  readonly answered: boolean;
  readonly open: boolean;
}

/**
 * El paso que la dirección pide abrir, o `undefined`.
 *
 * `Object.hasOwn` y no `includes` sobre un objeto ni `in`: la comparación es
 * contra una lista cerrada, y `?filtros=constructor` no puede pasar por un
 * paso válido.
 */
export function readSearchStep(raw: string | null | undefined): SearchStepId | undefined {
  if (raw === null || raw === undefined) return undefined;
  const value = raw.trim() as SearchStepId;
  return SEARCH_STEPS.includes(value) ? value : undefined;
}

/** Si el panel está abierto, en qué grupo, y qué hay que avisar. */
export interface FilterPanelState {
  readonly open: boolean;
  /** El grupo que la dirección nombró. Ausente = el primero sin contestar. */
  readonly step?: SearchStepId;
  readonly notice: string | null;
}

/**
 * **El panel de filtros es un estado de la página, y lo decide la dirección**
 * (14.33 + 14i).
 *
 * Al perder la barra lateral, los filtros llegan por un solo camino: el control
 * de filtro de la pastilla, que es *"la misma URL con el panel abierto desde el
 * servidor"*. Que "abierto" sea una lectura de la dirección y no un manejador
 * de clic es el piso sin JavaScript del D13 — un panel que sólo existe cuando
 * llega un script deja sin filtros a quien se quedó sin bundle, que en este
 * mercado es mucha gente.
 *
 * Los tres estados y por qué son tres:
 *
 * - **Ausente o vacío**: cerrado. Vacío es lo que deja un `<form method="get">`
 *   cuyo campo nadie llenó, y es el mismo criterio que `isFilteredZoneRoute`
 *   ya aplica del lado de la indexación.
 * - **`PANEL_OPEN_TOKEN`**: abierto sin grupo fijado.
 * - **Un grupo de la lista**: abierto en ése.
 * - **Cualquier otra cosa**: abierto igual, con aviso. Es la dirección vieja
 *   de `?filtros=zona`, y también `?filtros=constructor` — la comparación es
 *   contra una lista cerrada, así que no hay valor que se cuele como grupo.
 */
export function resolveFilterPanel(raw: string | null | undefined): FilterPanelState {
  const value = (raw ?? "").trim();
  if (value === "") return { open: false, notice: null };
  if (value === PANEL_OPEN_TOKEN) return { open: true, notice: null };

  const step = readSearchStep(value);
  if (step === undefined) return { open: true, notice: STALE_FILTER_GROUP_NOTICE };

  return { open: true, step, notice: null };
}

/**
 * Los cuatro pasos con su estado, y **exactamente uno abierto o ninguno**.
 *
 * Sin JavaScript el navegador no puede recordar qué sección estaba abierta al
 * volver del servidor, así que el paso abierto viaja en la dirección
 * (`?filtros=…`) y se decide acá. Cuando la dirección no dice nada se abre el
 * primero sin contestar, que es lo que hace que el acordeón avance solo:
 * elegís la zona y la próxima recarga abre el precio.
 *
 * Que sea uno solo no es cosmético — es la razón de ser del acordeón. Con los
 * cuatro abiertos a la vez en 360 px el botón del conteo queda cuatro
 * pantallas más abajo, y ése es justamente el botón que hay que ver mientras
 * se filtra.
 */
export function resolveSearchSteps(
  selection: SearchSelection,
  openStep?: SearchStepId,
): readonly SearchStepView[] {
  const answers: Readonly<Record<SearchStepId, { summary: string; answered: boolean }>> = {
    precio: {
      summary: priceSummary(selection),
      answered: selection.minPriceUsd !== undefined || selection.maxPriceUsd !== undefined,
    },
    habitaciones: {
      summary: sizeSummary(selection),
      answered:
        selection.minRooms !== undefined ||
        selection.minBathrooms !== undefined ||
        selection.minAreaM2 !== undefined,
    },
    publica: {
      summary: publisherSummary(selection.publisherType),
      answered: selection.publisherType !== undefined,
    },
    atributos: {
      summary: attributesSummary(selection.attributes),
      answered: (selection.attributes?.length ?? 0) > 0,
    },
  };

  const pending = SEARCH_STEPS.find((id) => !answers[id].answered);
  const open = openStep ?? pending;

  return SEARCH_STEPS.map((id, index) => ({
    id,
    position: index + 1,
    title: STEP_COPY[id].title,
    question: STEP_COPY[id].question,
    summary: answers[id].summary,
    answered: answers[id].answered,
    open: id === open,
  }));
}

/**
 * El rango, o de qué lado quedó abierto. **Los dos extremos son opcionales**
 * (F5), así que hay cuatro estados y ninguno puede quedar sin texto: un paso
 * cerrado y mudo parece roto.
 */
function priceSummary(selection: SearchSelection): string {
  const { minPriceUsd: min, maxPriceUsd: max } = selection;
  if (min !== undefined && max !== undefined) return `$${min} – $${max}`;
  if (min !== undefined) return `Desde $${min}`;
  if (max !== undefined) return `Hasta $${max}`;
  return "Cualquiera";
}

/**
 * El escalón elegido, con su «+» cuando corresponde.
 *
 * El «+» sale de `roomStepLabel` y no de un ternario acá: el criterio es un
 * MÍNIMO, y que el último escalón diga "o más" es la regla que ya vive en
 * `room-steps.ts`. Un `minRooms` que no es un escalón ofrecido —una dirección
 * escrita a mano con `hab=7`— se dice tal cual, porque el criterio lo admite
 * aunque el control no tenga un botón para pedirlo.
 */
function roomsSummary(minRooms: number | undefined): string {
  if (minRooms === undefined) return "Cualquiera";
  return isRoomStep(minRooms) ? `${roomStepLabel(minRooms)} hab` : `${minRooms}+ hab`;
}

/**
 * Los baños, con la misma regla y la misma trampa: el «+» del último escalón
 * sale de `bathroom-steps.ts`, y un `?banos=5` escrito a mano se dice tal cual
 * porque el criterio lo admite aunque el control no tenga botón para pedirlo.
 *
 * El singular no es cosmético: «1 baños» en el renglón del acordeón se lee como
 * un texto sin terminar, y este renglón es lo único que se ve del grupo cerrado.
 */
function bathroomsSummary(minBathrooms: number | undefined): string {
  if (minBathrooms === undefined) return "Cualquiera";
  const label = isBathroomStep(minBathrooms) ? bathroomStepLabel(minBathrooms) : `${minBathrooms}+`;
  return `${label} ${minBathrooms === 1 ? "baño" : "baños"}`;
}

/**
 * **Los metros², que no son un escalón sino un número escrito** (14.45 rebanada
 * B). Por eso no hay `+` ni lista que consultar: lo que se escribió es lo que
 * se dice.
 *
 * El «Desde» no es adorno — es un MÍNIMO, y «72 m²» a secas se leería como
 * «mide 72». Es la misma palabra con la que el precio ya dice su extremo
 * abierto, para que el renglón no invente un segundo vocabulario.
 */
function areaSummary(minAreaM2: number): string {
  return `Desde ${minAreaM2} m²`;
}

/**
 * **El grupo que el fundador llamó «tamaño», resumido entero** (14.45).
 *
 * Habitaciones y baños comparten grupo porque la lámina 7b los dibuja en la
 * misma columna, uno debajo del otro. El renglón cerrado del acordeón es lo
 * único que se ve de ese grupo en el teléfono, así que nombrar sólo la mitad
 * escondería justo el filtro que alguien acaba de poner.
 */
function sizeSummary(selection: SearchSelection): string {
  const parts = [
    ...(selection.minRooms === undefined ? [] : [roomsSummary(selection.minRooms)]),
    ...(selection.minBathrooms === undefined ? [] : [bathroomsSummary(selection.minBathrooms)]),
    ...(selection.minAreaM2 === undefined ? [] : [areaSummary(selection.minAreaM2)]),
  ];
  return parts.length === 0 ? "Cualquiera" : parts.join(" · ");
}

/**
 * Con qué se encabeza la pantalla de resultados: las zonas elegidas, o la
 * ciudad cuando no hay ninguna.
 *
 * Nunca queda vacío, y ése es el punto: la barra de la lámina dice «Chacao,
 * Altamira» y, sin zonas, tiene que seguir diciendo dónde se está buscando.
 */
export function searchHeadline(selection: SearchSelection): string {
  return selection.zoneNames.length === 0 ? selection.cityName : selection.zoneNames.join(", ");
}

/**
 * A quién publica, o «Cualquiera».
 *
 * Sale de la MISMA tabla que la barra resumen y las fichas quitables: dos
 * copias de la copia es cómo un filtro empieza a llamarse distinto según dónde
 * se lo mire, y entonces hay que adivinar de cuál está hablando cada una.
 */
function publisherSummary(publisherType: PublisherType | undefined): string {
  return publisherType === undefined ? "Cualquiera" : PUBLISHER_SUMMARY[publisherType];
}

/** Los atributos pedidos, todos: se combinan con Y y cada uno estrecha por su cuenta. */
function attributesSummary(attributes: readonly ListingAttribute[] | undefined): string {
  if (attributes === undefined || attributes.length === 0) return "Cualquiera";
  return attributes.map((attribute) => ATTRIBUTE_SUMMARY[attribute]).join(" · ");
}

/** Cómo se lee un publicador en el resumen. Copia, no regla. */
const PUBLISHER_SUMMARY: Readonly<Record<PublisherType, string>> = {
  owner: "dueños",
  broker: "inmobiliarias",
};

const ATTRIBUTE_SUMMARY: Readonly<Record<ListingAttribute, string>> = {
  hasPowerPlant: "planta",
  hasRegularWater: "agua",
  isFurnished: "amoblado",
  hasParking: "puesto",
  hasSecurity: "vigilancia",
  hasAppliances: "línea blanca",
};

/**
 * **`summariseSearch` se fue con la 14.42**, y no por parecer de más: era la
 * línea «9 avisos · $250 – $700 · 2 hab · dueños» de la `SearchSummaryBar`,
 * que la 14.41 sacó de las dos pantallas, y su único consumidor de producción
 * era `panel.summary`, que esa misma tarea borra. Sin los dos, la función no la
 * llamaba nadie.
 *
 * **Lo destapó la cobertura y no una lectura.** Al borrar `panel.summary`, el
 * bucle de atributos de esta función quedó como la ÚNICA sentencia sin cubrir
 * de todo el archivo: sus tres pruebas directas nunca le pasaban atributos, así
 * que la rama la ejercía el panel y nadie más. Una función sin consumidor cuyo
 * cuerpo sólo cubre a medias su propio archivo es el gate en verde que la
 * 14.42 nombra, así que se fue con sus pruebas.
 *
 * Nada colgaba de ella: `priceSummary`, `roomsSummary`, `PUBLISHER_SUMMARY` y
 * `ATTRIBUTE_SUMMARY` los siguen usando `resolveSearchSteps` y `describeFilter`.
 */

/**
 * **Cómo se nombra UN filtro suelto, con su valor adentro** — «Hasta $700»,
 * «2 hab», «Chacao».
 *
 * Es el vocabulario de `summariseSearch` partido en pedazos, y a propósito el
 * MISMO: la pantalla del vacío tiene que decir «"2 hab" es lo que deja la
 * búsqueda en cero» con las palabras que la barra resumen ya viene mostrando.
 * Dos tablas de copia para los mismos filtros es cómo empiezan a discrepar, y
 * una explicación que nombra el filtro distinto de como se ve en pantalla
 * obliga a adivinar de cuál está hablando.
 */
export function describeFilter(selection: SearchSelection, filter: RelaxableFilter): string {
  if (filter === "zone") return selection.zoneNames.join(", ");
  if (filter === "price") return priceSummary(selection);
  if (filter === "rooms") return roomsSummary(selection.minRooms);
  if (filter === "bathrooms") return bathroomsSummary(selection.minBathrooms);
  if (filter === "area") {
    return selection.minAreaM2 === undefined ? "" : areaSummary(selection.minAreaM2);
  }
  if (filter === "publisherType") {
    return selection.publisherType === undefined ? "" : PUBLISHER_SUMMARY[selection.publisherType];
  }
  return ATTRIBUTE_SUMMARY[filter];
}

/**
 * Los criterios más los nombres, que es lo único que el criterio no trae.
 *
 * `SearchCriteria` guarda ids —`cityId`, `zoneIds`— porque es lo que la
 * consulta necesita; el resumen necesita nombres. La traducción se escribe una
 * vez acá en vez de en cada pantalla que quiera decir qué se eligió.
 */
export function toSearchSelection(
  cityName: string,
  zoneNames: readonly string[],
  criteria: Pick<
    SearchCriteria,
    | "minPriceUsd"
    | "maxPriceUsd"
    | "minRooms"
    | "minBathrooms"
    | "minAreaM2"
    | "publisherType"
    | "attributes"
  >,
): SearchSelection {
  return {
    cityName,
    zoneNames,
    ...(criteria.minPriceUsd === undefined ? {} : { minPriceUsd: criteria.minPriceUsd }),
    ...(criteria.maxPriceUsd === undefined ? {} : { maxPriceUsd: criteria.maxPriceUsd }),
    ...(criteria.minRooms === undefined ? {} : { minRooms: criteria.minRooms }),
    ...(criteria.minBathrooms === undefined ? {} : { minBathrooms: criteria.minBathrooms }),
    ...(criteria.minAreaM2 === undefined ? {} : { minAreaM2: criteria.minAreaM2 }),
    ...(criteria.publisherType === undefined ? {} : { publisherType: criteria.publisherType }),
    ...(criteria.attributes === undefined ? {} : { attributes: criteria.attributes }),
  };
}

/**
 * Cuántos filtros dice la pastilla — el número de «3 filtros» (14i).
 *
 * **La zona NO cuenta, y ésa era toda la diferencia con el número del
 * engranaje** (`countActiveFilters`, borrado por la 14.49). Ese engranaje abría
 * un acordeón que tenía un paso de zona; la 14.36 sacó ciudad y zona del panel,
 * la 14.41 reemplazó la barra resumen por la pastilla, y desde entonces el
 * número del engranaje se calculaba sin que ninguna pantalla lo dibujara. La
 * pastilla abre precio, tamaño, quién publica y atributos, y la 14i lo dice
 * desde el otro lado: *"ciudad y zona no están ahí: eso lo resuelve el texto"*.
 * La lámina 7c lo dibuja — Chacao, Altamira, $250–$700, 2 habitaciones y dueños
 * puestos, y la pastilla diciendo **«3 filtros»**.
 *
 * La ciudad tampoco cuenta, por la misma razón de siempre (F8): es el contexto
 * de la búsqueda, no un filtro.
 *
 * Existe como función y no como una resta hecha en la página porque es la clase
 * de número que se dibuja bien estando mal: un «4 filtros» sobre un panel que
 * sólo abre tres no rompe nada visible, y ninguna prueba de dominio se pondría
 * roja — el suelo del 90 % llega a `domain/` y no llega a `app/`.
 */
export function countPillFilters(selection: SearchSelection): number {
  let count = selection.attributes?.length ?? 0;
  if (selection.minPriceUsd !== undefined || selection.maxPriceUsd !== undefined) count += 1;
  if (selection.minRooms !== undefined) count += 1;
  if (selection.minBathrooms !== undefined) count += 1;
  if (selection.minAreaM2 !== undefined) count += 1;
  if (selection.publisherType !== undefined) count += 1;
  return count;
}
