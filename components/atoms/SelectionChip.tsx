import type { ReactNode } from "react";
import { AppLink } from "./AppLink";
import styles from "./SelectionChip.module.css";

export interface SelectionChipProps {
  readonly href: string;
  /** Si esta ficha es la opción elegida del conjunto. */
  readonly selected: boolean;
  /**
   * Qué significa "elegida" para el documento que la usa. El inicio quita la
   * ciudad al tocarla —no es "la página en la que estás", es la opción
   * marcada de un conjunto— y manda `"true"`; `/mis-avisos` sí filtra la
   * misma pantalla y manda `"page"`. La 22.5 unificó el color; esto no lo
   * toca porque es semántica de accesibilidad, no idioma visual.
   */
  readonly ariaCurrent: "true" | "page";
  readonly children: ReactNode;
}

/**
 * **La ficha de selección** (tasks.md 22.5, 22.12) — un enlace que elige una
 * opción de un conjunto, con una marcada. La 22.5 unificó el idioma visual
 * (relleno `--tint`, borde y texto `--accent` cuando está elegida, nivel 2 de
 * la jerarquía de botones); esta tarea unifica el COMPONENTE, que la 22.5
 * dejó a medio camino: `home.module.css` y `mis-avisos.module.css` seguían
 * declarando cada una su propia pastilla, con tipografías y alturas mínimas
 * distintas que ya habían empezado a discrepar — la misma forma de deuda que
 * la 22.3 cerró un escalón más arriba para el metadato.
 *
 * **No es `FilterChips`.** Esa ficha es otro papel: siempre representa un
 * filtro *aplicado*, siempre lleva su `×` de quitar, y no tiene estado "no
 * elegida" — fundirlas fundiría dos roles, el mismo error que este archivo ya
 * documenta para el título de aviso.
 *
 * **Convergió a la tipografía que ya traía el inicio** (`--meta`, mono,
 * `--meta-fs-sm`), no a la de `/mis-avisos` (`--sans`, `--control-fs`): el
 * inicio ya era la referencia para el color desde la 22.5 — dos contra uno
 * cuando entra `FilterChips.module.css` en la cuenta, igual que esa tarea lo
 * decidió — y extender el mismo precedente a la tipografía es no inventar una
 * segunda regla de convergencia para el mismo par de pantallas.
 */
export function SelectionChip({ href, selected, ariaCurrent, children }: SelectionChipProps) {
  return (
    <AppLink
      className={selected ? styles.selected : styles.chip}
      href={href}
      aria-current={selected ? ariaCurrent : undefined}
    >
      {children}
    </AppLink>
  );
}
