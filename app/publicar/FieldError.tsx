import styles from "./publish-steps.module.css";

/**
 * **El mensaje va ANTES del campo que lo produjo y se anuncia, no sólo se
 * dibuja.** La razón está escrita en `violation-copy.ts` y no es estética: *«un
 * borde rojo es invisible para quien no distingue colores y para el modo de
 * alto contraste»*. El `id` es el que el control nombra en su
 * `aria-describedby`, y el control lleva además `aria-invalid`.
 *
 * **Vivía adentro de `PublishStep`** hasta la 18.22, que necesitaba la misma
 * anatomía en la pantalla de editar. Se movió en vez de copiarse: dos maneras
 * de anunciar un mismo tipo de error es como un producto empieza a
 * contradecirse a sí mismo, y la segunda es la que se queda sin `aria-invalid`.
 */
export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p className={styles.error} id={id}>
      {message}
    </p>
  );
}
