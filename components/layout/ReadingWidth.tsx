import type { ReactNode } from "react";
import styles from "./ReadingWidth.module.css";

/**
 * The 520px reading-width cap for running/body text (tasks.md 1b.12,
 * SISTEMA.md "Cuerpo" — "15px / 400 / 1.55, ancho de lectura máx. 520px").
 * A line longer than ~75 characters is harder to track back to its start;
 * capping width, not font-size, is how the system holds that line length.
 */
export function ReadingWidth({ children }: { children: ReactNode }) {
  return <div className={styles.reading}>{children}</div>;
}
