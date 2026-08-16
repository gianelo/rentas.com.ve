import type { LabelHTMLAttributes } from "react";
import styles from "./Label.module.css";

type Props = LabelHTMLAttributes<HTMLLabelElement> & { htmlFor: string };

/**
 * Real associated `<label>` element (design.md D15, tasks.md 1b.5/2.5,
 * SISTEMA.md "Accesible: etiquetas reales en formularios"). A placeholder
 * attribute on the control is never a substitute — it disappears the
 * moment a value is entered, and screen readers, forced-colors mode, and
 * autofill all key off a genuine label/control association (`htmlFor`),
 * not the placeholder text.
 *
 * Deferred from PR1b (tasks.md 1b.5's "Partial" note) until a slice
 * needed a real form control — the cascading city/zone select is that
 * first consumer.
 */
export function Label({ children, htmlFor, ...props }: Props) {
  return (
    <label className={styles.label} htmlFor={htmlFor} {...props}>
      {children}
    </label>
  );
}
