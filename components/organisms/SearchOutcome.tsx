import type { SearchOutcome as SearchOutcomeModel } from "@/modules/listing-search/domain/search-exits";
import styles from "./SearchOutcome.module.css";

/**
 * **Las dos puntas de la lista: el vacío y el final** (F11 y F10).
 *
 * No decide nada, y ésa es la regla: qué filtro causó el vacío, qué salidas se
 * ofrecen, en qué orden y con qué número lo resolvió
 * `resolveSearchOutcome` en el dominio, contra los conteos reales de la base.
 * Acá sólo se escribe el marcado — la regla permanente del fundador prohíbe una
 * regla de negocio en el front, y el suelo de cobertura del 90 % no llega a
 * `components/`, así que una decisión escrita acá no pondría nada en rojo.
 *
 * Enlaces y ningún botón: cada salida es una **dirección**, tiene que poder
 * abrirse en otra pestaña, guardarse y pegarse, y funcionar sin una línea de
 * JavaScript (D13/F14). El `href` ya viene armado del dominio.
 */
export function SearchOutcome({ model }: { readonly model: SearchOutcomeModel }) {
  // A mitad de una lista paginada no hay nada que decir: cerrar sería mentir,
  // porque todavía faltan avisos.
  if (model.kind === "partial") return null;

  if (model.kind === "empty") {
    return (
      <section
        className={styles.outcome}
        aria-label="Ningún resultado"
        data-testid="search-outcome"
      >
        <p className={styles.cause}>{model.cause}</p>

        {model.exits.length === 0 ? null : (
          <>
            <p className={styles.lead}>Un solo cambio y hay avisos:</p>
            <ul className={styles.exits}>
              {model.exits.map((exit) => (
                <li key={exit.kind}>
                  {/* El número va DENTRO de la etiqueta, igual que en el botón
                      del acordeón: se decide antes de tocar, no después. */}
                  <a className={styles.exit} href={exit.href}>
                    {exit.label}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    );
  }

  return (
    <section className={styles.outcome} aria-label="Fin de la lista" data-testid="search-close">
      <p className={styles.closing}>{model.closing}</p>
      {model.exit === null ? null : (
        <a className={styles.exit} href={model.exit.href}>
          {model.exit.label}
        </a>
      )}
    </section>
  );
}
