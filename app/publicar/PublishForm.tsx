import type { ReactNode } from "react";
import { ActionButton } from "../../components/atoms/buttons";
import { Label } from "../../components/atoms/Label";
import { FormShell } from "../../components/layout/FormShell";
import {
  MIN_DESCRIPTION_CHARACTERS,
  type PublishViolation,
} from "../../src/modules/listing-publication/domain/publishable-listing";
import styles from "./publish-form.module.css";
import { PUBLISH_VIOLATION_COPY, type PublishField } from "./violation-copy";

/**
 * SISTEMA.md screen 3, step 1 of 2. "Es un formulario, no un embudo de cinco
 * pasos" — one column, every field visible, and step 2 is the photos.
 *
 * A server component with a native `method="post"`. The design allows client
 * JS in step 2 only (to compress photos on the device), and this screen is
 * the one someone fills standing up on a phone: it has to work before any
 * bundle arrives, on a connection that may never deliver one.
 *
 * **Two departures from the design's field list, both deliberate.**
 * `habitaciones` and `metros²` are not in it — it reads "publicás como ·
 * título · precio · ciudad · zona · descripción" — but `listing.rooms` and
 * `listing.area_m2` are NOT NULL, the result row renders `zona · N hab · N
 * m²`, search filters by rooms, and the broker importer has a Habitaciones
 * column. Without these two inputs an owner publishing one listing cannot
 * produce a valid row at all. Placement is the founder's decision, recorded:
 * after the location, before the description, grouped as the physical facts.
 */

export interface FormCity {
  readonly id: string;
  readonly name: string;
}

export interface FormZone {
  readonly id: string;
  readonly name: string;
  readonly cityId: string;
}

/**
 * Strings, not numbers. These are the values a browser posted, and a price
 * typed as "quinientos" has to survive the round trip so it can be shown
 * back next to its error — parsing it away would blank the field and hide
 * what the publisher actually wrote.
 */
export interface PublishFormValues {
  readonly publisherType?: string;
  readonly title?: string;
  readonly priceUsd?: string;
  readonly cityId?: string;
  readonly zoneId?: string;
  readonly rooms?: string;
  readonly areaM2?: string;
  readonly description?: string;
}

export interface PublishFormProps {
  readonly cities: readonly FormCity[];
  readonly zones: readonly FormZone[];
  readonly values?: PublishFormValues;
  readonly violations?: readonly PublishViolation[];
}

const REQUIRED_MARK = "✱ obligatorio";

/** What `Field` hands its control: identity, the submitted value, and the
 *  accessibility attributes that must never be forgotten on one of eight. */
interface ControlAttributes {
  id: string;
  name: string;
  defaultValue: string;
  className?: string;
  "aria-invalid"?: "true";
  "aria-describedby"?: string;
}

export function PublishForm({ cities, zones, values = {}, violations = [] }: PublishFormProps) {
  // Grouped by field so each control can name its own message through
  // `aria-describedby`. A single list at the top of the form would make a
  // screen-reader user hunt for which control each sentence belongs to.
  const errors = new Map<PublishField, string>();
  for (const violation of violations) {
    const copy = PUBLISH_VIOLATION_COPY[violation];
    if (!errors.has(copy.field)) {
      errors.set(copy.field, copy.message({ description: values.description }));
    }
  }

  /**
   * One field, rendered the same way every time. Written once rather than
   * eight times because the parts that must not drift are the invisible
   * ones: `aria-invalid`, the `aria-describedby` that reads the message
   * aloud, the 2px error border, and the submitted value coming back. Eight
   * hand-written copies is eight chances for one of them to lose the
   * `aria-describedby` and fail silently for exactly the people it is for.
   */
  function Field({
    name,
    label,
    help,
    children,
  }: {
    // `keyof PublishFormValues`, not `PublishField`: `photos` is a field the
    // domain validates but this screen has no control for — it belongs to
    // step 2 — so a `<Field name="photos">` is made unrepresentable rather
    // than merely avoided.
    name: keyof PublishFormValues;
    label: string;
    help?: string;
    children: (attributes: ControlAttributes) => ReactNode;
  }) {
    const message = errors.get(name);

    return (
      <div className={styles.field}>
        <Label htmlFor={name}>
          {label} {REQUIRED_MARK}
        </Label>
        {children({
          id: name,
          name,
          defaultValue: values[name] ?? "",
          className: message ? `${styles.control} ${styles.controlInvalid}` : styles.control,
          ...(message ? { "aria-invalid": "true", "aria-describedby": `${name}-error` } : {}),
        })}
        {help && <p className={styles.help}>{help}</p>}
        {message && (
          <p className={styles.error} id={`${name}-error`}>
            {message}
          </p>
        )}
      </div>
    );
  }

  const zonesForCity = values.cityId ? zones.filter((zone) => zone.cityId === values.cityId) : [];
  const publisherTypeError = errors.get("publisherType");

  return (
    <FormShell>
      <form method="post" className={styles.form}>
        <fieldset className={styles.fieldset}>
          {/* A fieldset/legend rather than a Label: a radio group has no single
              control for a label to point at. */}
          <legend className={styles.legend}>Publicás como {REQUIRED_MARK}</legend>
          {/* No `defaultChecked` anywhere, and none may be added. The domain
              refuses a missing publisher type and applies no default so that
              nobody is published as an owner they never claimed to be — a
              pre-selected radio would restore that default in the one layer
              the domain cannot see. */}
          <div className={styles.choices}>
            <label className={styles.choice}>
              <input type="radio" name="publisherType" value="owner" />
              Dueño
            </label>
            <label className={styles.choice}>
              <input type="radio" name="publisherType" value="broker" />
              Inmobiliaria
            </label>
          </div>
          <p className={styles.help}>No se puede cambiar después de publicar.</p>
          {publisherTypeError && (
            <p className={styles.error} id="publisherType-error">
              {publisherTypeError}
            </p>
          )}
        </fieldset>

        <Field name="title" label="Título" help="Como lo dirías vos, sin mayúsculas de más.">
          {(attributes) => <input {...attributes} type="text" />}
        </Field>

        <Field
          name="priceUsd"
          label="Precio mensual"
          help="Solo el número. Todos los precios están en dólares."
        >
          {/* `inputMode` rather than `type="number"`: a number input hides what
              a publisher typed when it cannot parse it, and this form shows
              the offending value back next to its error. */}
          {(attributes) => <input {...attributes} type="text" inputMode="numeric" />}
        </Field>

        <Field name="cityId" label="Ciudad">
          {(attributes) => (
            <select {...attributes}>
              <option value="">Elegí una ciudad</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field name="zoneId" label="Zona">
          {/* Filtered here rather than by the caller, the rule CityZoneSelect
              already follows: nothing is left for a caller to forget. */}
          {(attributes) => (
            <select {...attributes}>
              <option value="">Elegí primero la ciudad</option>
              {zonesForCity.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field name="rooms" label="Habitaciones" help="Un estudio cuenta como 1.">
          {(attributes) => <input {...attributes} type="text" inputMode="numeric" />}
        </Field>

        <Field name="areaM2" label="Metros cuadrados">
          {(attributes) => <input {...attributes} type="text" inputMode="numeric" />}
        </Field>

        {/* The minimum is stated before anyone fails it. The design pairs a
            neutral help text with the error rather than letting the error be
            the first time the rule is mentioned. */}
        <Field
          name="description"
          label="Descripción"
          help={`Mínimo ${MIN_DESCRIPTION_CHARACTERS} caracteres. Contá lo que no se ve en las fotos.`}
        >
          {(attributes) => <textarea {...attributes} rows={6} />}
        </Field>

        <p className={styles.closing}>
          Tu aviso queda activo 30 días. Te avisamos antes de que venza.
        </p>

        <ActionButton type="submit">Continuar a las fotos</ActionButton>
      </form>
    </FormShell>
  );
}
