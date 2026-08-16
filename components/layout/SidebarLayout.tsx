import type { ReactNode } from "react";
import styles from "./SidebarLayout.module.css";

/**
 * The two-column filter-sidebar + results layout (tasks.md 1b.13). Desktop
 * only: `grid: 240px 1fr`, `gap: 32px`, sidebar `position: sticky`. Below
 * the breakpoint, filters and results stack in a single column.
 */
export function SidebarLayout({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.layout}>
      <div className={styles.sidebar}>{sidebar}</div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
