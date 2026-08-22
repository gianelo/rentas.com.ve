import styles from "./StatStrip.module.css";

export interface StatStripProps {
  readonly rooms: number;
  readonly bathrooms: number;
  readonly areaM2: number;
  readonly parkingSpots: number;
}

/**
 * La tira de cuatro datos de la ficha (F24/R4).
 *
 * **Las cuatro celdas se dibujan SIEMPRE, y un cero se muestra como "0".** No
 * es una preferencia de estilo: el esquema ya lo dice sobre las columnas que la
 * alimentan — la tira "dibuja cuatro celdas iguales y no tiene estado vacío
 * para ninguna". Ocultar la celda de puestos cuando vale cero deja tres celdas
 * y un hueco, que se lee como un error de carga; mostrarla en cero dice algo
 * verdadero: **cero estacionamientos es un hecho sobre la propiedad**, no un
 * dato que falte, y es algo sobre lo que un inquilino filtra.
 */
export function StatStrip({ rooms, bathrooms, areaM2, parkingSpots }: StatStripProps) {
  const cells = [
    { value: rooms, label: "Hab" },
    { value: bathrooms, label: "Baños" },
    { value: areaM2, label: "m²" },
    { value: parkingSpots, label: parkingSpots === 1 ? "Puesto" : "Puestos" },
  ];

  return (
    <dl className={styles.strip} data-testid="stat-strip">
      {cells.map((cell) => (
        <div className={styles.cell} key={cell.label}>
          <dd className={styles.value}>{cell.value}</dd>
          <dt className={styles.label}>{cell.label}</dt>
        </div>
      ))}
    </dl>
  );
}
