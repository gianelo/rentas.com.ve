import { ActionButton } from "../../components/atoms/buttons";
import { FormShell } from "../../components/layout/FormShell";
import { Field, FieldRow, REQUIRED_MARK } from "../../components/molecules/Field";
import {
  MIN_DESCRIPTION_CHARACTERS,
  type PublishViolation,
} from "../../src/modules/listing-publication/domain/publishable-listing";
import styles from "./publish-form.module.css";
import { PUBLISH_VIOLATION_COPY, type PublishField } from "./violation-copy";

/**
 * SISTEMA.md screen 3, step 1 of 2 — artboard `2c`.
 *
 * Every label, help text, order and measurement here is transcribed from the
 * design system's own markup
 * (`design/reference/sistema/pantallas-compacto-menta.html`). The first
 * version of this file was built from the handoff prose instead, which
 * describes the rules but never the layout, and it differed in nine ways
 * while passing every test in the suite — because no test in the suite could
 * see layout. The measurements in `tests/measure/layout.spec.ts` are the
 * other half of that fix.
 *
 * A native `method="post"` server component: JS is allowed in step 2 only, to
 * compress photos on the device. This is the screen someone fills standing up
 * on a phone, and it has to work before any bundle arrives.
 *
 * **`habitaciones` and `metros²` are not in the design's field list.** Both
 * columns are NOT NULL, the result row renders `zona · N hab · N m²`, search
 * filters by rooms, and the importer has a Habitaciones column — so without
 * them an owner publishing one listing cannot produce a valid row. Surfaced
 * before building; the founder chose this placement.
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
 * typed as "quinientos" has to survive the round trip so it can be shown back
 * next to its error — parsing it away would blank the field and hide what the
 * publisher actually wrote.
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
  /**
   * The Server Action that receives the submission. Optional so the layout
   * harness and the unit specs can render the real form without a server
   * runtime — those two need its geometry and its markup, not its handler.
   * The page always passes one.
   */
  readonly action?: (formData: FormData) => Promise<void>;
}

export function PublishForm({
  cities,
  zones,
  values = {},
  violations = [],
  action,
}: PublishFormProps) {
  const errors = new Map<PublishField, string>();
  for (const violation of violations) {
    const copy = PUBLISH_VIOLATION_COPY[violation];
    if (!errors.has(copy.field)) {
      errors.set(copy.field, copy.message({ description: values.description }));
    }
  }

  const zonesForCity = values.cityId ? zones.filter((zone) => zone.cityId === values.cityId) : [];
  const publisherTypeError = errors.get("publisherType");

  return (
    <FormShell>
      <form action={action} method="post" className={styles.form}>
        <fieldset className={styles.fieldset}>
          {/* A fieldset/legend rather than a Label: a radio group has no single
              control for a label to point at. */}
          <legend className={styles.legend}>
            ¿Publicás como dueño o inmobiliaria?
            <span className={styles.required}> {REQUIRED_MARK}</span>
          </legend>

          {/* The artboard draws these as two boxes, not radios. Real radios
              ship anyway: they are what makes the group submit and stay
              operable without JavaScript. The appearance is the design's, the
              semantics are the ones a form needs.

              No `defaultChecked` here, and none may be added — the domain
              refuses a missing publisher type and applies no default so that
              nobody is published as an owner they never claimed to be. */}
          <div className={styles.choices}>
            <label className={styles.choice}>
              <input
                className={styles.choiceInput}
                type="radio"
                name="publisherType"
                value="owner"
              />
              <span className={styles.choiceBox}>Dueño</span>
            </label>
            <label className={styles.choice}>
              <input
                className={styles.choiceInput}
                type="radio"
                name="publisherType"
                value="broker"
              />
              <span className={styles.choiceBox}>Inmobiliaria</span>
            </label>
          </div>

          {publisherTypeError ? (
            <p className={styles.error} id="publisherType-error">
              {publisherTypeError}
            </p>
          ) : null}
          <p className={styles.help}>
            Se muestra siempre en tu aviso. No se puede cambiar después.
          </p>
        </fieldset>

        <Field
          name="title"
          label="Título"
          required
          value={values.title}
          error={errors.get("title")}
        >
          {(attributes) => <input {...attributes} type="text" />}
        </Field>

        <Field
          name="priceUsd"
          label="Precio mensual en dólares"
          required
          help="Solo el número. Todos los precios están en dólares."
          value={values.priceUsd}
          error={errors.get("priceUsd")}
        >
          {/* The display font with tabular numerals, as the artboard specifies
              — the same rule the Price atom already carries. `inputMode`
              rather than `type="number"`, because a number input hides what
              was typed when it cannot parse it, and this form shows the
              offending value back next to its error. */}
          {(attributes) => (
            <input
              {...attributes}
              className={`${attributes.className} ${styles.priceControl}`}
              type="text"
              inputMode="numeric"
            />
          )}
        </Field>

        <FieldRow>
          <Field name="cityId" label="Ciudad" value={values.cityId} error={errors.get("cityId")}>
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

          {/* Filtered here rather than by the caller, the rule CityZoneSelect
              already follows: nothing is left for a caller to forget. */}
          <Field name="zoneId" label="Zona" value={values.zoneId} error={errors.get("zoneId")}>
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
        </FieldRow>

        <FieldRow>
          <Field
            name="rooms"
            label="Habitaciones"
            help="Un estudio cuenta como 1."
            value={values.rooms}
            error={errors.get("rooms")}
          >
            {(attributes) => <input {...attributes} type="text" inputMode="numeric" />}
          </Field>

          <Field
            name="areaM2"
            label="Metros cuadrados"
            value={values.areaM2}
            error={errors.get("areaM2")}
          >
            {(attributes) => <input {...attributes} type="text" inputMode="numeric" />}
          </Field>
        </FieldRow>

        <Field
          name="description"
          label="Descripción"
          help={`Mínimo ${MIN_DESCRIPTION_CHARACTERS} caracteres. Mientras más detalle, más contactos recibís.`}
          value={values.description}
          error={errors.get("description")}
        >
          {(attributes) => <textarea {...attributes} rows={3} />}
        </Field>

        <ActionButton type="submit">Continuar a las fotos</ActionButton>

        {/* Below the button, where the artboard puts it. */}
        <p className={styles.closing}>
          Tu aviso queda activo 30 días. Te avisamos antes de que venza.
        </p>
      </form>
    </FormShell>
  );
}
