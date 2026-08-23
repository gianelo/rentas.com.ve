import { AppLink } from "../atoms/AppLink";
import styles from "./SearchSummaryBar.module.css";

/**
 * **La barra de resultados en el teléfono**: adónde volver, qué se está
 * mirando, y el engranaje que abre el acordeón.
 *
 * Es el tercero de los tres estados que la lámina dibuja para la misma barra —
 * sin buscar nada, con una zona elegida, y con cuatro filtros puestos. Lo que
 * cambia entre los tres es el texto y el número del engranaje; la estructura
 * es una sola.
 *
 * **En escritorio no existe**, y no es un descuido: ahí los filtros están a la
 * vista en la barra lateral de 240 px, así que un resumen de lo que se está
 * viendo sería repetir en palabras lo que ya se ve en controles. La lámina lo
 * dice con todas las letras — «sin pastilla de resumen: los filtros están a la
 * vista». Se esconde por CSS y no por una rama en JavaScript, porque el
 * marcado no depende del ancho.
 *
 * No decide nada: el encabezado, el resumen y el conteo de filtros los arma
 * `listing-search/domain/search-accordion.ts`.
 */
export interface SearchSummaryBarProps {
  /** Adónde vuelve la flecha. La ciudad, o el inicio. */
  readonly backHref: string;
  /** «Chacao, Altamira», o la ciudad si no hay zonas elegidas. */
  readonly headline: string;
  /** «9 avisos · $250 – $700 · 2 hab · dueños». El conteo va primero. */
  readonly summary: string;
  /** Cuántos filtros hay puestos. La ciudad no cuenta: es el contexto. */
  readonly activeFilters: number;
  /** La misma dirección con el acordeón abierto en el primer paso. */
  readonly openHref: string;
}

export function SearchSummaryBar({
  backHref,
  headline,
  summary,
  activeFilters,
  openHref,
}: SearchSummaryBarProps) {
  return (
    <div className={styles.bar} data-testid="search-summary-bar">
      <AppLink className={styles.back} href={backHref} aria-label="Volver">
        ←
      </AppLink>

      <div className={styles.text}>
        <p className={styles.headline}>{headline}</p>
        <p className={styles.summary}>{summary}</p>
      </div>

      <AppLink className={styles.gear} href={openHref} aria-label="Abrir los filtros">
        <span aria-hidden="true">⚙</span>
        {/* El número sólo aparece cuando hay filtros puestos: un «0» pegado al
            engranaje se lee como un contador roto, y la lámina lo dibuja vacío
            en los dos primeros estados de la barra. */}
        {activeFilters > 0 ? <span className={styles.badge}>{activeFilters}</span> : null}
      </AppLink>
    </div>
  );
}
