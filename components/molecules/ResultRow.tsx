import { Price } from "../atoms/Price";
import { PublisherBadge } from "../atoms/PublisherBadge";
import styles from "./ResultRow.module.css";

export interface ResultRowProps {
  priceUsd: number;
  title: string;
  zone: string;
  rooms: number;
  areaM2: number;
  publisherType: "owner" | "broker";
}

/**
 * Result-row molecule (tasks.md 1b.8, SISTEMA.md "Fila de resultado").
 * Grid `[thumbnail] 1fr`; price shares its line with the publisher badge
 * and precedes the title in DOM order; metadata sits below the
 * two-line-clamped title. Density is bounded by CSS (1b.10/1b.11), never a
 * count of rows above the fold.
 */
export function ResultRow({ priceUsd, title, zone, rooms, areaM2, publisherType }: ResultRowProps) {
  return (
    <article className={styles.row} data-testid="result-row">
      <div className={styles.thumb} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.line1}>
          <Price usd={priceUsd} />
          <PublisherBadge publisherType={publisherType} />
        </div>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.meta}>
          {zone} · {rooms} hab · {areaM2} m²
        </p>
      </div>
    </article>
  );
}
