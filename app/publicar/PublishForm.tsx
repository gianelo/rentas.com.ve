import { ActionButton } from "../../components/atoms/buttons";
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
  readonly bathrooms?: string;
  readonly parkingSpots?: string;
  readonly contactMethod?: string;
  readonly contactValue?: string;
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

  const publisherTypeError = errors.get("publisherType");

  return (
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
            <input className={styles.choiceInput} type="radio" name="publisherType" value="owner" />
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
        <p className={styles.help}>Se muestra siempre en tu aviso. No se puede cambiar después.</p>
      </fieldset>

      <Field name="title" label="Título" required value={values.title} error={errors.get("title")}>
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

        {/* Every zone, grouped by its city, rather than only the selected
              city's.

              **This is the shape a cascade cannot have without JavaScript.**
              The first version filtered by `values.cityId`, which only ever
              arrived as a query parameter — and the city `<select>` sits
              inside a POST form with nothing to reload the page, so it never
              arrived at all. The zone list was empty for every city and the
              form could not be submitted, ever. No unit test caught it
              because they all handed `cityId` in as a prop, which is not the
              path a person walks.

              `<optgroup>` is what lets one static select serve both cities:
              the group label says which city a zone belongs to, so a
              mismatched pair is visible before the validator has to explain
              it — and `zoneId.notInCity` plus `listing`'s composite foreign
              key still refuse the pairing if someone insists. */}
        <Field name="zoneId" label="Zona" value={values.zoneId} error={errors.get("zoneId")}>
          {(attributes) => (
            <select {...attributes}>
              <option value="">Elegí una zona</option>
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

      {/* Artboard 2b's stat strip draws four cells -- `2 HAB | 2 BAÑOS | 78 M²
            | 1 PUESTO` -- and until now only two of them had a column behind
            them. Like `habitaciones` and `metros²` above, the design RENDERS
            these and never collects them; surfaced before building, and the
            founder chose this shape (2026-08-20).

            The two are deliberately asymmetric. `baños` is required, because
            a blank cell beside three numbers reads as broken rather than as
            absent. `puesto` defaults to 0 and says so in its help text, so
            nobody has to type a zero to publish an anexo without parking --
            and 0 is stored as the fact it is, not as a missing value. */}
      <FieldRow>
        <Field
          name="bathrooms"
          label="Baños"
          help="Contá el de servicio si lo tiene."
          value={values.bathrooms}
          error={errors.get("bathrooms")}
        >
          {(attributes) => <input {...attributes} type="text" inputMode="numeric" />}
        </Field>

        <Field
          name="parkingSpots"
          label="Puestos de estacionamiento"
          help="Si no tiene, dejalo vacío."
          value={values.parkingSpots}
          error={errors.get("parkingSpots")}
        >
          {(attributes) => <input {...attributes} type="text" inputMode="numeric" />}
        </Field>
      </FieldRow>

      {/* The contact is the whole point of the product: a tenant finds a
            listing and gets a way to reach whoever published it. **The design
            draws it and never asks for it** — artboard 2b renders "Ver
            WhatsApp del dueño" while no artboard collects a value — so this
            pair is an addition to the design, surfaced rather than slipped in.

            Copied onto the listing at publish time: editing the account
            default later must not rewrite adverts somebody has already seen. */}
      <FieldRow>
        <Field
          name="contactMethod"
          label="¿Por dónde te contactan?"
          required
          value={values.contactMethod}
          error={errors.get("contactMethod")}
        >
          {(attributes) => (
            <select {...attributes}>
              <option value="">Elegí</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telefono">Teléfono</option>
              <option value="email">Correo</option>
            </select>
          )}
        </Field>

        <Field
          name="contactValue"
          label="Tu dato"
          required
          help="Se muestra solo a quien inicie sesión."
          value={values.contactValue}
          error={errors.get("contactValue")}
        >
          {(attributes) => <input {...attributes} type="text" />}
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
  );
}
