import type { ReactNode } from "react";
import styles from "./DetailSplit.module.css";

/**
 * The listing-detail split (tasks.md 1b.13): 640px media column + 420px
 * sticky data column on desktop, stacked on mobile.
 */
export function DetailSplit({ media, data }: { media: ReactNode; data: ReactNode }) {
  return (
    <div className={styles.split}>
      <div className={styles.media}>{media}</div>
      <div className={styles.data}>{data}</div>
    </div>
  );
}
