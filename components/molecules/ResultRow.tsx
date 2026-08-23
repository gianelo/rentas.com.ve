import { AppLink } from "../atoms/AppLink";
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
  /**
   * Where the row leads. Optional so the layout harness can render a row
   * without inventing a listing id — but a search result without one is a
   * dead end, so the search page always passes it.
   */
  href?: string;
  /**
   * City and age, which artboard 2a shows **only at 1280**: `zona · ciudad ·
   * N hab · N m² · hace 4 días`. The mobile frame drops both, and that is a
   * decision rather than truncation — a phone row is bound to 96px and every
   * word competes with the title, while a city name is redundant when the
   * whole search is one city.
   *
   * They are hidden with CSS rather than omitted from the DOM: the same
   * markup serves both widths, and a crawler reading the page with no
   * viewport gets the fuller sentence.
   */
  city?: string;
  ageLabel?: string;
}

/**
 * Result-row molecule (tasks.md 1b.8, SISTEMA.md "Fila de resultado").
 * Grid `[thumbnail] 1fr`; price shares its line with the publisher badge
 * and precedes the title in DOM order; metadata sits below the
 * two-line-clamped title. Density is bounded by CSS (1b.10/1b.11), never a
 * count of rows above the fold.
 */
export function ResultRow({
  priceUsd,
  title,
  zone,
  rooms,
  areaM2,
  publisherType,
  href,
  city,
  ageLabel,
}: ResultRowProps) {
  return (
    <article className={styles.row} data-testid="result-row">
      <div className={styles.thumb} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.line1}>
          <Price usd={priceUsd} />
          <PublisherBadge publisherType={publisherType} />
        </div>
        <h3 className={styles.title}>
          {href ? (
            <AppLink className={styles.link} href={href}>
              {title}
            </AppLink>
          ) : (
            title
          )}
        </h3>
        <p className={styles.meta}>
          {zone}
          {city ? <span className={styles.wide}> · {city}</span> : null} · {rooms} hab · {areaM2} m²
          {ageLabel ? <span className={styles.wide}> · {ageLabel}</span> : null}
        </p>
      </div>
    </article>
  );
}
