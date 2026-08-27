import { ActionButton, NeutralButton } from "../../components/atoms/buttons";
import styles from "./importar.module.css";
import type { VistaPreviaResultado } from "./preview";

/**
 * Lámina 14g — "Revisá antes de crear".
 *
 * **Las filas con problema van primero, y acá van solas.** La lámina las pone
 * arriba de la tabla; lo que esta porción dibuja es exactamente eso, más el
 * recuento de las que están listas. **Desvío anotado, no resuelto en
 * silencio** (AGENTS.md §5): la lámina muestra además las celdas ofensoras
 * —referencia, precio, zona, habitaciones, título— y `ImportRowError` no las
 * lleva: sólo tiene `rowNumber` y `reasons`. Ensanchar el dominio para que las
 * cargue es trabajo separable, anotado como tarea 9.29 en `tasks.md`, y
 * completarlas a ojo acá sería inventar el dato.
 *
 * **Sin filas listas no se dibuja el botón de crear.** Un botón que crea cero
 * miente sobre lo que va a pasar; lo que hace falta es corregir el archivo, y
 * ése queda como único camino (AGENTS.md §7).
 */
export function VistaPrevia({
  preview,
  archivo,
  onCrear,
  onCorregir,
  enviando = false,
}: {
  readonly preview: VistaPreviaResultado;
  readonly archivo: string;
  readonly onCrear?: () => void;
  readonly onCorregir?: () => void;
  readonly enviando?: boolean;
}) {
  const conProblema = preview.errores.length;
  const hayQueCrear = preview.listas > 0;

  return (
    <section className={styles.previa}>
      <h2 className={styles.tituloSeccion}>Revisá antes de crear</h2>
      <p className={styles.archivo}>
        {archivo} · {preview.totalFilas} filas
      </p>

      <p className={styles.cuenta}>
        <strong className={styles.cuentaOk}>{preview.listas}</strong> listas para crear ·{" "}
        <strong className={styles.cuentaErr}>{conProblema}</strong> con un problema
      </p>

      <p className={styles.explicacion}>
        {hayQueCrear
          ? `Podés crear las ${preview.listas} ahora y las ${conProblema} con problema quedan afuera, o corregir el archivo y volver a subirlo completo.`
          : "Ninguna fila quedó lista para crear. Corregí los problemas de abajo y volvé a subir el archivo completo."}
      </p>

      {conProblema > 0 ? (
        <ul className={styles.problemas}>
          {preview.errores.map((error) => (
            <li key={error.fila} className={styles.problema}>
              <span className={styles.problemaFila}>Fila {error.fila}</span>
              <span className={styles.problemaRazon}>{error.razones.join(" · ")}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.acciones}>
        {hayQueCrear ? (
          <ActionButton onClick={onCrear} disabled={enviando}>
            {etiquetaCrear(preview.listas)}
          </ActionButton>
        ) : null}
        <NeutralButton onClick={onCorregir} disabled={enviando}>
          Corregir el archivo y volver a subir
        </NeutralButton>
      </div>
    </section>
  );
}

/** El texto del botón, para que la pantalla y su prueba lo lean del mismo lugar. */
export function etiquetaCrear(listas: number): string {
  return `Crear las ${listas} propiedades`;
}
