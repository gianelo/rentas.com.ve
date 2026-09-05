import styles from "./legal.module.css";

/**
 * The visible marker every /legal page carries until the founder ratifies
 * its text (tasks.md 23.5 — the agent drafts, the founder ratifies, and the
 * task does not close until ratification does). A published placeholder is
 * worse than an absent page because it reads as a commitment; a substantive
 * draft honestly labelled as unratified is neither. Removing this from each
 * page is part of closing 23.5, never a separate task.
 */
export function DraftNotice() {
  return (
    <p className={styles.notice}>
      <strong>Borrador en revisión.</strong> Este texto describe el comportamiento real de
      rentas.com.ve tal como funciona hoy, pero todavía no ha sido ratificado por el fundador del
      sitio. No lo tomes como la versión final.
    </p>
  );
}
