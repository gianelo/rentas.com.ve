import type { ReactNode } from "react";
import styles from "./ListingTitle.module.css";

export interface ListingTitleProps {
  /**
   * El nivel de encabezado, que es una decisión del **documento** y no del
   * átomo: en la cuadrícula de resultados el título cuelga de un `<h1>` de
   * pantalla y es un `<h3>`; en `/mis-avisos` cuelga directo del `<h1>` de la
   * página y es un `<h2>`. Cerrado a dos valores a propósito — un `as` libre
   * dejaría a alguien dibujarlo como `<div>` y romper el esquema del
   * documento sin que nada se pusiera rojo.
   */
  readonly level: 2 | 3;
  /**
   * Recortar a dos líneas. Es geometría del contenedor, no del tipo: la
   * cuadrícula lo necesita porque un título largo empuja los metadatos y
   * desalinea la tarjeta vecina, y la lista apilada de `/mis-avisos` no —la
   * lámina 14c la dibuja sin recortar—. Va como bandera cerrada y no como un
   * `className` libre, que devolvería el agujero que este átomo cierra.
   */
  readonly clamp?: boolean;
  readonly children: ReactNode;
}

/**
 * El título de un aviso **en una lista** (tasks.md 1b.5, SISTEMA.md "Título de
 * aviso (lista)").
 *
 * **Sólo ese papel.** El `<h1>` de la ficha y el pie del visor de fotos NO
 * entran: son otros papeles tipográficos, con sus propios tokens, y fundirlos
 * en uno es exactamente cómo el `<h1>` del inicio terminó agarrando `--fpb`
 * —"Precio en ficha"— sin que ningún gate lo viera.
 *
 * **Por qué se promovió ahora.** Los dos consumidores vivos ya discrepaban:
 * la tarjeta dibujaba `--ftw` (400) recortado a dos líneas y `/mis-avisos`
 * `--ficha-title-fw` (600) sin recortar. Medido en un navegador, 400 contra
 * 600 y 17,55px contra 20,8px de interlínea — la misma frase con dos pesos
 * según la pantalla (tests/measure/layout.spec.ts, 22.4).
 */
export function ListingTitle({ level, clamp = false, children }: ListingTitleProps) {
  const Heading = level === 2 ? "h2" : "h3";
  const className = clamp ? `${styles.title} ${styles.clamped}` : styles.title;

  return <Heading className={className}>{children}</Heading>;
}
