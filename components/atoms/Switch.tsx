import styles from "./Switch.module.css";

export interface SwitchProps {
  readonly on: boolean;
}

/**
 * **El interruptor de la lámina 7b** (tasks.md 22.11), uno por atributo del
 * panel de filtros. Es decorativo y no interactivo: el elemento que decide y
 * lleva el foco es el enlace que lo envuelve (`AttributeOptionItem` en
 * `SearchPanel.tsx`), que es el piso sin JavaScript de la 14.33. Por eso no
 * lleva `role="switch"` ni maneja el teclado — eso pondría dos roles
 * semánticos sobre el mismo control, y el que manda es `link`.
 *
 * **Entra a `SISTEMA.md` como anatomía nueva**, la misma dirección que la
 * 22.1 usó para la cuadrícula: la lámina dibuja algo que el sistema todavía
 * no nombraba, y se registra en vez de corregirla.
 */
export function Switch({ on }: SwitchProps) {
  return (
    <span className={styles.track} data-on={on ? "" : undefined} aria-hidden="true">
      <span className={styles.knob} />
    </span>
  );
}
