import { ROOM_STEPS, roomStepLabel } from "@/modules/listing-search/domain/room-steps";
import {
  LISTING_ATTRIBUTES,
  type ListingAttribute,
  SEARCHABLE_PROPERTY_TYPES,
  type SearchablePropertyType,
} from "@/modules/listing-search/domain/search-criteria";
import { ActionButton } from "../atoms/buttons";
import { Label } from "../atoms/Label";
import styles from "./SearchFilters.module.css";

/**
 * Artboard 2a's filters, which are **one control set rendered two ways**: a
 * row of chips on a phone, a 240px sidebar at 1280. Not two components and
 * not a breakpoint hiding half the fields — the same `<form method="get">`,
 * recomposed, so a filtered search is one URL whichever width produced it.
 *
 * A GET form is the whole mechanism (design.md, D11/D13): every change
 * reloads with the query in the URL, which makes a filtered search
 * **linkable, shareable and indexable**. That matters more than usual here,
 * because listings circulate by WhatsApp — a filter state nobody can paste
 * into a chat is a filter state that does not travel.
 *
 * There is no `onChange` and no client component. The submit button is
 * visible and required: without JavaScript nothing applies a filter until
 * somebody says so, and hiding that button would leave the form unusable for
 * exactly the visitors the no-JS rule exists for.
 *
 * **Este componente no decide nada.** Los escalones de habitaciones, los cinco
 * tipos de propiedad y los cinco atributos los trae del dominio de
 * `listing-search`; qué grupos se dibujan y cómo se llaman los parámetros los
 * trae de quien lo usa. `ROOM_STEPS` vivía acá adentro, con la regla de que
 * "el 4 significa cuatro o más" escrita en un ternario — una regla de negocio
 * en un componente, que es lo que la regla permanente del fundador prohíbe, y
 * que además ninguna corrida de tests podía romper porque el suelo de
 * cobertura no llega a `components/`.
 */

export interface FilterCity {
  readonly id: string;
  readonly name: string;
}

export interface FilterZone {
  readonly id: string;
  readonly name: string;
  readonly cityId: string;
}

export interface SearchFilterValues {
  readonly city?: string;
  readonly zone?: string;
  readonly minPrice?: string;
  readonly maxPrice?: string;
  readonly minRooms?: string;
  readonly propertyType?: string;
  readonly publisherType?: string;
  readonly attributes?: readonly ListingAttribute[];
}

/** Cada campo que el formulario puede mandar. */
export type SearchFilterField =
  | "city"
  | "zone"
  | "minPrice"
  | "maxPrice"
  | "minRooms"
  | "propertyType"
  | "publisherType"
  | ListingAttribute;

/** Cada grupo de controles que se puede dibujar. */
export type SearchFilterControl =
  | "place"
  | "price"
  | "rooms"
  | "propertyType"
  | "publisherType"
  | "attributes";

export interface SearchFiltersProps {
  readonly cities: readonly FilterCity[];
  readonly zones: readonly FilterZone[];
  readonly values?: SearchFilterValues;
  /** Rendered beside the action, as artboard 2a's sidebar shows it. */
  readonly resultCount?: number;
  /**
   * Cómo se llama cada campo en la query. Opcional, y por defecto los nombres
   * largos que este formulario siempre mandó.
   *
   * Existe porque las dos pantallas que lo usan escriben URLs distintas: el
   * inicio manda `?minPrice=`, y la de resultados manda los nombres cortos del
   * fundador (F12: `min`, `max`, `hab`, `tipo`). El renombre es del borde de
   * entrega, así que lo pasa quien entrega y no lo decide este archivo.
   */
  readonly names?: Partial<Readonly<Record<SearchFilterField, string>>>;
  /**
   * Qué grupos se dibujan. Por defecto, exactamente los de siempre.
   *
   * Un grupo que la página que lo recibe no sabe leer es peor que ninguno:
   * una casilla que se destilda sola al recargar parece un error del sitio.
   * En la ruta `/alquiler/<ciudad>/<zona>` el lugar lo afirma la dirección,
   * así que ahí `place` no se pide.
   */
  readonly controls?: readonly SearchFilterControl[];
}

/** Los nombres largos, que son los que el inicio lee hoy. */
const DEFAULT_NAMES: Readonly<Record<SearchFilterField, string>> = {
  city: "city",
  zone: "zone",
  minPrice: "minPrice",
  maxPrice: "maxPrice",
  minRooms: "minRooms",
  propertyType: "propertyType",
  publisherType: "publisherType",
  hasPowerPlant: "hasPowerPlant",
  hasRegularWater: "hasRegularWater",
  isFurnished: "isFurnished",
  hasParking: "hasParking",
  hasSecurity: "hasSecurity",
  hasAppliances: "hasAppliances",
};

const DEFAULT_CONTROLS: readonly SearchFilterControl[] = ["place", "price", "rooms"];

/**
 * Copia, no reglas: qué opciones existen lo dice el dominio, y esto es cómo
 * se leen en pantalla. Los `Record` completos son el chequeo — un sexto tipo
 * o un sexto atributo no compila hasta que alguien escriba su etiqueta, en
 * vez de aparecer en la lista con su nombre interno.
 */
const PROPERTY_TYPE_LABELS: Readonly<Record<SearchablePropertyType, string>> = {
  apartamento: "Apartamento",
  casa: "Casa",
  quinta: "Quinta",
  anexo: "Anexo",
  habitacion: "Habitación",
};

const ATTRIBUTE_LABELS: Readonly<Record<ListingAttribute, string>> = {
  hasPowerPlant: "Planta eléctrica",
  hasRegularWater: "Agua regular",
  isFurnished: "Amoblado",
  // Corto como los demás rótulos de este formulario, que abrevia «Vigilancia
  // 24 h» a «Vigilancia»: en este mercado «puesto» ya significa esto.
  hasParking: "Puesto",
  hasSecurity: "Vigilancia",
  hasAppliances: "Línea blanca",
};

export function SearchFilters({
  cities,
  zones,
  values = {},
  resultCount,
  names,
  controls = DEFAULT_CONTROLS,
}: SearchFiltersProps) {
  const name: Readonly<Record<SearchFilterField, string>> = { ...DEFAULT_NAMES, ...names };
  const shows = (control: SearchFilterControl) => controls.includes(control);
  const chosenAttributes = new Set(values.attributes ?? []);

  return (
    <form method="get" className={styles.filters} data-testid="search-filters">
      {shows("place") ? (
        <>
          <div className={styles.group}>
            <span className={styles.groupLabel}>Ciudad</span>
            {/* Two exclusive options, as radios rather than a select: 2a draws
                them as a pair of buttons, and a two-option select hides half the
                product behind a tap. */}
            <div className={styles.exclusive}>
              {cities.map((city) => (
                <label key={city.id} className={styles.choice}>
                  <input
                    className={styles.choiceInput}
                    type="radio"
                    name={name.city}
                    value={city.id}
                    defaultChecked={values.city === city.id}
                  />
                  <span className={styles.choiceBox}>{city.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.group}>
            <span className={styles.groupLabel}>Zona</span>
            {/* **Rendered, not filtered.** `zones` arrives already narrowed to the
                selected city by `zonesForCity` (listing-catalogue's domain). This
                control used to render the whole taxonomy in an `<optgroup>` per
                city, so choosing Maracaibo still offered Chacao — and the filter
                that fixed it belongs in the domain, not here, because a rule in a
                component is a rule the coverage floor never reaches.

                The cascade costs one reload: picking a city and submitting brings
                the list back narrowed. That is the price of D13's no-JS read path,
                paid deliberately — a client-side narrow would ship a bundle to the
                cheap phones the rule exists for. */}
            <select
              id="zone"
              name={name.zone}
              className={styles.control}
              defaultValue={values.zone ?? ""}
              aria-label="Zona"
            >
              <option value="">Todas las zonas</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      {shows("price") ? (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Precio mensual</span>
          <div className={styles.range}>
            <Label htmlFor="minPrice">Desde</Label>
            <input
              id="minPrice"
              name={name.minPrice}
              type="text"
              inputMode="numeric"
              className={styles.control}
              defaultValue={values.minPrice ?? ""}
            />
            <Label htmlFor="maxPrice">Hasta</Label>
            <input
              id="maxPrice"
              name={name.maxPrice}
              type="text"
              inputMode="numeric"
              className={styles.control}
              defaultValue={values.maxPrice ?? ""}
            />
          </div>
        </div>
      ) : null}

      {shows("rooms") ? (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Habitaciones</span>
          {/* Los escalones y la etiqueta del último los trae el dominio: qué
              significa el «4» es una decisión de producto, y acá sólo se
              dibuja. */}
          <div className={styles.exclusive}>
            {ROOM_STEPS.map((step) => (
              <label key={step} className={styles.choice}>
                <input
                  className={styles.choiceInput}
                  type="radio"
                  name={name.minRooms}
                  value={step}
                  defaultChecked={values.minRooms === String(step)}
                />
                <span className={styles.choiceBox}>{roomStepLabel(step)}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {shows("propertyType") ? (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Tipo</span>
          <select
            id="propertyType"
            name={name.propertyType}
            className={styles.control}
            defaultValue={values.propertyType ?? ""}
            aria-label="Tipo de propiedad"
          >
            {/* La opción vacía es la ausencia de filtro, y tiene que existir:
                sin ella no hay forma de volver a "cualquier tipo" sin editar
                la dirección a mano. */}
            <option value="">Cualquier tipo</option>
            {SEARCHABLE_PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>
                {PROPERTY_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {shows("publisherType") ? (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Quién publica</span>
          {/* F6, tal como lo pidió el fundador: "sólo de dueños". Una casilla
              y no tres botones — la pregunta que la gente se hace es ésa, y
              "cualquiera" es no marcarla. */}
          <div className={styles.exclusive}>
            <label className={styles.choice}>
              <input
                className={styles.choiceInput}
                type="checkbox"
                name={name.publisherType}
                value="owner"
                defaultChecked={values.publisherType === "owner"}
              />
              <span className={styles.choiceBox}>Sólo de dueños</span>
            </label>
          </div>
        </div>
      ) : null}

      {shows("attributes") ? (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Servicios declarados</span>
          {/* «Declarados» y no «con»: marcar una casilla pide los avisos que
              lo anotaron, y no marcarla no pide los que dijeron que no —
              nadie dijo que no. El criterio no puede expresar esa otra
              pregunta, y el encabezado no la promete. */}
          <div className={styles.exclusive}>
            {LISTING_ATTRIBUTES.map((attribute) => (
              <label key={attribute} className={styles.choice}>
                <input
                  className={styles.choiceInput}
                  type="checkbox"
                  name={name[attribute]}
                  value="1"
                  defaultChecked={chosenAttributes.has(attribute)}
                />
                <span className={styles.choiceBox}>{ATTRIBUTE_LABELS[attribute]}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <ActionButton type="submit">
        {resultCount === undefined ? "Buscar" : `Ver ${resultCount} propiedades`}
      </ActionButton>
    </form>
  );
}
