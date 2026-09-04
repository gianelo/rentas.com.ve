import styles from "./DeclaredFeatures.module.css";

export interface DeclaredFeaturesProps {
  readonly hasPowerPlant: boolean;
  readonly hasRegularWater: boolean;
  readonly isFurnished: boolean;
  readonly hasSecurity: boolean;
  readonly hasAppliances: boolean;
  /**
   * **Un número, no un booleano** (14.45 rebanada C). `listing.parking_spots`
   * ya existe y el paso 4 de publicar la escribe siempre, así que un
   * `hasParking` al lado guardaría el mismo hecho dos veces. Ausente se lee
   * como cero: es lo que vale una ficha vieja que todavía no lo pasa.
   */
  readonly parkingSpots?: number;
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
  // **El puesto se lista pero NO entra en la aclaración de abajo**, y la
  // asimetría tiene una sola razón: el paso 4 de publicar pide el número
  // siempre —«Puestos permite 0»—, así que acá el cero es un cero declarado y
  // no un silencio. Nombrarlo como no declarado diría que nadie contestó sobre
  // una respuesta que sí existe, y la tira de datos de arriba ya la escribe.
  // La regla de la sección se respeta igual: no se dibuja ninguna ausencia.
  const hasParking = (props.parkingSpots ?? 0) > 0;
  const declared = [
    ...FEATURES.filter(([key]) => props[key]),
    ...(hasParking ? ([["hasParking", "Puesto de estacionamiento"]] as const) : []),
  ];
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
