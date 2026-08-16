import styles from "./Price.module.css";

/** Listing price (tasks.md 1b.9, SISTEMA.md "El precio domina"). Monospace,
 * tabular-nums, so prices align as a column across result rows. */
export function Price({ usd }: { usd: number }) {
  return <span className={styles.price}>${usd}</span>;
}
