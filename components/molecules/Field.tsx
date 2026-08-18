import type { ReactNode } from "react";
import styles from "./Field.module.css";

/**
 * One labelled form field, rendered the same way on every screen.
 *
 * **This exists so that adding a field is one line rather than fifteen.** The
 * publish form first wrote this pattern by hand, eight times, inside its own
 * page — and the parts that must not drift between copies are the invisible
 * ones: `aria-invalid`, the `aria-describedby` that reads the message aloud,
 * the 2px error border, and the submitted value coming back. Eight hand
 * copies is eight chances to drop one and fail silently for exactly the
 * people it exists for. A ninth screen would have started from zero.
 *
 * Every measurement here comes from the design system's own artboard markup
 * (`design/reference/sistema/pantallas-compacto-menta.html`), not from
 * reading a screenshot.
 *
 * ## Three rules this component makes structural
 *
 * 1. **Required is the glyph AND the word**, never colour alone. The design
 *    says so outright, and this form is filled one-handed on a phone in
 *    daylight, sometimes in forced-colors mode where the red is simply gone.
 * 2. **The error is announced, not only drawn.** A border says nothing to a
 *    screen reader; `aria-describedby` is what speaks.
 * 3. **The error comes before the help text**, matching the artboard — and
 *    the help text stays. The rule must not be mentioned for the first time
 *    by the message that says you broke it.
 */

/** What `Field` hands its control. Spread onto the input/select/textarea. */
export interface ControlAttributes {
  id: string;
  name: string;
  defaultValue: string;
  className?: string;
  "aria-invalid"?: "true";
  "aria-describedby"?: string;
}

export interface FieldProps {
  /** Doubles as the control's `id` and `name`, so the label always matches. */
  readonly name: string;
  readonly label: string;
  /**
   * Renders `✱ obligatorio`. Deliberately opt-in per field rather than
   * inferred: the artboard marks the publisher type, the title and the price,
   * and leaves the selects unmarked — a component that decided this for
   * itself would disagree with the design on every screen at once.
   */
  readonly required?: boolean;
  readonly help?: string;
  readonly error?: string;
  readonly value?: string;
  readonly children: (attributes: ControlAttributes) => ReactNode;
}

export const REQUIRED_MARK = "✱ obligatorio";

export function Field({
  name,
  label,
  required = false,
  help,
  error,
  value = "",
  children,
}: FieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={name}>
        {label}
        {required ? <span className={styles.required}> {REQUIRED_MARK}</span> : null}
      </label>

      {children({
        id: name,
        name,
        defaultValue: value,
        className: error ? `${styles.control} ${styles.controlInvalid}` : styles.control,
        ...(error ? { "aria-invalid": "true", "aria-describedby": `${name}-error` } : {}),
      })}

      {error ? (
        <p className={styles.error} id={`${name}-error`}>
          {error}
        </p>
      ) : null}
      {help ? <p className={styles.help}>{help}</p> : null}
    </div>
  );
}

/**
 * Two related fields on one line — the city/zone pair.
 *
 * `flex: 1` on each child with a 12px gap, taken from the artboard, and it is
 * a row at **every** width: the mobile 360 artboard pairs them exactly as the
 * desktop one does. That is why this is a component rather than a media
 * query, and why the next screen that pairs two selects gets it for free.
 */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}
