import { Fragment } from "react";
import { ActionButton, NeutralButton } from "../../components/atoms/buttons";
import styles from "./importar.module.css";
import type { FilaConProblema, NombreDeCelda, VistaPreviaResultado } from "./preview";

/**
 * Lámina 14g — "Revisá antes de crear".
 *
 * **Las filas con problema van primero, y acá van solas.** La lámina las pone
 * arriba de la tabla; lo que esta porción dibuja es exactamente eso, más el
 * recuento de las que están listas.
 *
 * **La tarjeta de móvil, no la tabla de escritorio, y es una decisión de la
 * lámina.** 14g dice al pie: *"en móvil no se convierte en tabla angosta, se
 * vuelve tarjetas de error más un resumen de las correctas"*. La tarjeta dice
 * lo mismo que la fila de la tabla —«Fila 7 · MB-0114», el título, «$520 · El
 * Rosal · 2 hab», el problema— en una sola forma que sirve a los dos anchos;
 * la tabla de 996 px es un segundo diseño de la misma información y queda
 * como trabajo separable.
 *
 * **El desvío 2 de la 9.26, cerrado (tasks.md 9.29).** `ImportRowError` ya
 * lleva las celdas de su fila, así que la pantalla muestra el valor ofensor
 * en vez de nombrar sólo la fila. Sigue sin inventarlo: una celda que el
 * archivo trajo vacía no se dibuja.
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
              <span className={styles.problemaFila}>
                Fila {error.fila}
                {error.celdas.referencia === "" ? null : (
                  <>
                    {" · "}
                    <Celda error={error} nombre="referencia">
                      {error.celdas.referencia}
                    </Celda>
                  </>
                )}
              </span>
              {error.celdas.titulo === "" ? null : (
                <span className={styles.problemaTitulo}>
                  <Celda error={error} nombre="titulo">
                    {error.celdas.titulo}
                  </Celda>
                </span>
              )}
              {/* «$520 · El Rosal · 2 hab» — sólo las celdas que el archivo
                  trajo. Un separador colgando de una celda vacía se lee como
                  un dato que se perdió, no como uno que falta. */}
              <span className={styles.problemaCeldas}>{meta(error)}</span>
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

/**
 * `<mark>` y no una clase decorativa. El resaltado que 14g pide es una
 * afirmación sobre el texto —«éste es el valor que está mal»— y `<mark>` es
 * el elemento que la lleva: existe para quien lee la pantalla en voz alta,
 * no sólo para quien la ve. Su fondo amarillo de fábrica lo apaga
 * `importar.module.css`, que es donde viven los tokens.
 */
function Celda({
  error,
  nombre,
  children,
}: {
  readonly error: FilaConProblema;
  readonly nombre: NombreDeCelda;
  readonly children: string;
}) {
  if (!error.resaltadas.includes(nombre)) return <>{children}</>;
  return <mark className={styles.celdaResaltada}>{children}</mark>;
}

/** Las tres celdas del renglón del medio, separadas por «·», sin las vacías. */
function meta(error: FilaConProblema) {
  const partes = [
    error.celdas.precio === "" ? null : (
      <Celda key="precio" error={error} nombre="precio">
        {`$${error.celdas.precio}`}
      </Celda>
    ),
    error.celdas.zona === "" ? null : (
      <Celda key="zona" error={error} nombre="zona">
        {error.celdas.zona}
      </Celda>
    ),
    error.celdas.habitaciones === "" ? null : (
      <Celda key="habitaciones" error={error} nombre="habitaciones">
        {`${error.celdas.habitaciones} hab`}
      </Celda>
    ),
  ].filter((parte) => parte !== null);

  return partes.map((parte, indice) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: el separador no tiene identidad propia
    <Fragment key={indice}>
      {indice === 0 ? null : " · "}
      {parte}
    </Fragment>
  ));
}
