import type { FilterChip } from "@/modules/listing-search/domain/search-panel";
import { AppLink } from "../atoms/AppLink";
import styles from "./FilterChips.module.css";

/**
 * **Los filtros puestos, quitables de a uno** (lámina 7c).
 *
 * Existe por lo que la 14.33 se llevó. Con la barra lateral afuera y la
 * `SearchSummaryBar` ya borrada por la 14.41, la pantalla de resultados se
 * quedaba **sin decir qué está filtrando**: el panel lo sabe, pero el panel
 * ahora está cerrado. La lámina lo resuelve con estas fichas —«Chacao ×
 * Altamira × $250 – $700 × 2 habitaciones × Solo de dueños ×»— y lo anota al
 * lado: *"se saca un filtro sin abrir nada"*.
 *
 * **Este componente no decide nada.** Qué fichas hay, cómo se lee cada una y a
 * qué dirección lleva su «×» lo arma `search-panel.ts`. Acá sólo se escribe el
 * marcado — que además es el único que puede: quitar una zona devuelve a su
 * ruta canónica y quitar un filtro no toca la ubicación, y ésas son dos reglas
 * distintas que una plantilla no puede distinguir.
 *
 * Enlaces y ningún botón, sin JavaScript: son direcciones, y tienen que poder
 * abrirse en otra pestaña y funcionar con el script apagado (D13).
 */
export function FilterChips({
  chips,
  clearAllHref,
}: {
  readonly chips: readonly FilterChip[];
  readonly clearAllHref: string;
}) {
  // Sin filtros puestos no hay fila: una barra vacía es cromo antes de la
  // primera foto, que es lo que vende en esta pantalla.
  if (chips.length === 0) return null;

  return (
    <ul className={styles.chips} aria-label="Filtros puestos" data-testid="filter-chips">
      {chips.map((chip) => (
        <li key={chip.label} className={styles.chip}>
          <span className={styles.label}>{chip.label}</span>
          {/* El «×» es un carácter y va `aria-hidden`; lo que se anuncia es la
              etiqueta que escribió el dominio. Un «×» solo no se lee en voz
              alta, y son cinco seguidos. */}
          <AppLink className={styles.remove} href={chip.removeHref} aria-label={chip.removeLabel}>
            <span aria-hidden="true">×</span>
          </AppLink>
        </li>
      ))}
      <li>
        <AppLink className={styles.clear} href={clearAllHref}>
          Limpiar todo
        </AppLink>
      </li>
    </ul>
  );
}
