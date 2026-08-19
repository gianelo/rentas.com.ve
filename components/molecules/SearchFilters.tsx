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
}

export interface SearchFiltersProps {
  readonly cities: readonly FilterCity[];
  readonly zones: readonly FilterZone[];
  readonly values?: SearchFilterValues;
  /** Rendered beside the action, as artboard 2a's sidebar shows it. */
  readonly resultCount?: number;
}

/** The segmented control 2a draws: 1 / 2 / 3 / 4+. */
const ROOM_STEPS = ["1", "2", "3", "4"] as const;

export function SearchFilters({ cities, zones, values = {}, resultCount }: SearchFiltersProps) {
  return (
    <form method="get" className={styles.filters} data-testid="search-filters">
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
                name="city"
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
        {/* Every zone, grouped by city — the same shape the publish form
            needed. A cascade that depends on a reload cannot narrow this list
            before the visitor has chosen, and a zone belonging to the other
            city is dropped by the server rather than hidden here. */}
        <select
          id="zone"
          name="zone"
          className={styles.control}
          defaultValue={values.zone ?? ""}
          aria-label="Zona"
        >
          <option value="">Todas las zonas</option>
          {cities.map((city) => (
            <optgroup key={city.id} label={city.name}>
              {zones
                .filter((zone) => zone.cityId === city.id)
                .map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Precio mensual</span>
        <div className={styles.range}>
          <Label htmlFor="minPrice">Desde</Label>
          <input
            id="minPrice"
            name="minPrice"
            type="text"
            inputMode="numeric"
            className={styles.control}
            defaultValue={values.minPrice ?? ""}
          />
          <Label htmlFor="maxPrice">Hasta</Label>
          <input
            id="maxPrice"
            name="maxPrice"
            type="text"
            inputMode="numeric"
            className={styles.control}
            defaultValue={values.maxPrice ?? ""}
          />
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Habitaciones</span>
        {/* "4" means four or more, and the label says so. A segmented control
            whose last step silently meant "exactly four" would hide every
            larger apartment from the people most likely to want one. */}
        <div className={styles.exclusive}>
          {ROOM_STEPS.map((step) => (
            <label key={step} className={styles.choice}>
              <input
                className={styles.choiceInput}
                type="radio"
                name="minRooms"
                value={step}
                defaultChecked={values.minRooms === step}
              />
              <span className={styles.choiceBox}>{step === "4" ? "4+" : step}</span>
            </label>
          ))}
        </div>
      </div>

      <ActionButton type="submit">
        {resultCount === undefined ? "Buscar" : `Ver ${resultCount} propiedades`}
      </ActionButton>
    </form>
  );
}
