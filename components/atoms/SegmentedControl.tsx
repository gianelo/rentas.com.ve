import { AppLink } from "./AppLink";
import styles from "./SegmentedControl.module.css";

export interface SegmentedControlOption {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly chosen: boolean;
  readonly disabled: boolean;
  readonly href: string;
  readonly previewLabel: string | null;
}

export interface SegmentedControlProps {
  readonly options: readonly SegmentedControlOption[];
}

/**
 * **El control segmentado de la lámina 7b** (tasks.md 22.11): habitaciones y
 * baños en el panel de filtros de escritorio, ninguno de los dos existía
 * antes como átomo. Hoy el panel dibuja **enlaces** — el piso sin JavaScript
 * de la 14.33 —, así que esta tarea no es "cambiar el marcado": es conseguir
 * el aspecto segmentado sin dejar de ser enlaces, y por eso cada opción sigue
 * siendo un `<a>` (`AppLink`) y no un `<input type="radio">` ni un `<button>`.
 *
 * **Entra a `SISTEMA.md` como anatomía nueva**, en vez de corregir la lámina
 * por dibujar algo que el sistema todavía no nombraba — la misma dirección
 * que la 22.1 usó para registrar la cuadrícula.
 *
 * Una opción deshabilitada se dibuja como `<span aria-disabled="true">`, la
 * misma regla que el resto del panel: no existe un enlace apagado, y
 * dejarlo enlazado mandaría a una pantalla vacía.
 */
export function SegmentedControl({ options }: SegmentedControlProps) {
  return (
    <ul className={styles.segmented}>
      {options.map((option) => (
        <li key={option.key}>
          {option.disabled ? (
            <span className={styles.segment} aria-disabled="true">
              <span className={styles.label}>{option.label}</span>
              <span className={styles.count}>{option.count}</span>
            </span>
          ) : (
            // Rol `link`: `aria-pressed` pertenece al rol `button` y ningún
            // lector de pantalla lo anuncia acá. Lo elegido viaja en
            // `aria-current`, igual que el resto del panel.
            <AppLink
              className={styles.segment}
              href={option.href}
              aria-current={option.chosen ? "true" : undefined}
              data-chosen={option.chosen ? "" : undefined}
              data-preview={option.previewLabel ?? undefined}
            >
              <span className={styles.label}>{option.label}</span>
              <span className={styles.count}>{option.count}</span>
            </AppLink>
          )}
        </li>
      ))}
    </ul>
  );
}
