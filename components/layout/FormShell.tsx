import type { ReactNode } from "react";
import styles from "./FormShell.module.css";

/**
 * The single-column 600px form shell (tasks.md 1b.13). Used by the
 * publish form and every other form surface (SISTEMA.md, "Formularios:
 * una sola columna de 600px").
 */
export function FormShell({ children }: { children: ReactNode }) {
  return <div className={styles.formShell}>{children}</div>;
}
