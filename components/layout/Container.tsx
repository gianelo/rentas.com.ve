import type { ReactNode } from "react";
import styles from "./Container.module.css";

/**
 * The 1100px desktop container (tasks.md 1b.13, SISTEMA.md "Layout de
 * escritorio"). Purely structural — no colour, radius, or typography — so
 * it carries no data-theme/data-layout dependency of its own.
 */
export function Container({ children }: { children: ReactNode }) {
  return <div className={styles.container}>{children}</div>;
}
