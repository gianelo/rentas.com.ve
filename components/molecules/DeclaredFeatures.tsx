import styles from "./DeclaredFeatures.module.css";

export interface DeclaredFeaturesProps {
  readonly hasPowerPlant: boolean;
  readonly hasRegularWater: boolean;
  readonly isFurnished: boolean;
  readonly hasSecurity: boolean;
  readonly hasAppliances: boolean;
}

/** El orden es el del diseño, y el rótulo el que el fundador escribió. */
const FEATURES = [
  ["hasPowerPlant", "Planta eléctrica"],
  ["hasRegularWater", "Agua regular"],
  ["isFurnished", "Amoblado"],
  ["hasSecurity", "Vigilancia 24 h"],
  ["hasAppliances", "Línea blanca"],
] as const;

/**
 * "La propiedad tiene" (F25/R5).
 *
 * **Sólo se lista lo declarado. Nunca se afirma una ausencia.** Es la regla más
 * delicada de la ficha y la más fácil de romper con buenas intenciones: un
 * interruptor apagado en el formulario se ve como un "no", y quien lea la
 * columna sin saberlo va a renderizar "No amoblado" — que es **decir algo que
 * el sistema no sabe**. Que alguien no marcara "amoblado" significa que no lo
 * declaró, no que la propiedad no lo esté.
 *
 * La línea de abajo es lo que hace honesta a la lista sin mentir: nombra lo que
 * quedó afuera **como no declarado**, en vez de callarlo o de afirmarlo.
 *
 * Si no hay ninguno, la sección no se dibuja. Un encabezado sobre una lista
 * vacía dice "esta propiedad no tiene nada", que es la misma mentira.
 */
export function DeclaredFeatures(props: DeclaredFeaturesProps) {
  const declared = FEATURES.filter(([key]) => props[key]);
  if (declared.length === 0) return null;

  const missing = FEATURES.filter(([key]) => !props[key]).map(([, label]) => label);

  return (
    <section className={styles.block} data-testid="declared-features">
      <h2 className={styles.heading}>La propiedad tiene</h2>
      <ul className={styles.list}>
        {declared.map(([key, label]) => (
          <li className={styles.item} key={key}>
            <span className={styles.check} aria-hidden="true">
              ✓
            </span>
            {label}
          </li>
        ))}
      </ul>
      {missing.length > 0 ? (
        <p className={styles.note}>
          Solo se lista lo declarado. No se declaró: {missing.join(", ").toLowerCase()}.
        </p>
      ) : null}
    </section>
  );
}
