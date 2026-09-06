import styles from "./PhotoCounter.module.css";

export interface PhotoCounterProps {
  /** Cuántas fotos tiene el aviso en total. */
  readonly total: number;
}

/**
 * El contador de fotos sobre la portada de la tarjeta — "1 / 6" (tasks.md
 * 22.8, SISTEMA.md "Geometría de la tarjeta de resultado").
 *
 * **Siempre dice 1.** La tarjeta sólo dibuja la portada; la posición que se
 * ve es siempre la primera, y `total` es el único dato variable — viene de
 * `GridCard.photoCount`, que `buildListingGrid` trae de `coversFor` (F9 no
 * cambia: un aviso sin portada sigue sin tarjeta).
 *
 * **`aria-hidden`.** La cifra repite lo que el visor de fotos ya anuncia
 * mejor al abrir la ficha; acá es una pista visual sobre la imagen, no un
 * dato que un lector de pantalla necesite anunciar dos veces.
 */
export function PhotoCounter({ total }: PhotoCounterProps) {
  return (
    <span className={styles.counter} aria-hidden="true">
      1 / {total}
    </span>
  );
}
