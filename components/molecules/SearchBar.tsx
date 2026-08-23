import styles from "./SearchBar.module.css";

/** El `id` que ata la etiqueta con el campo. Uno solo: hay una caja por página. */
const FIELD_ID = "buscador";

export interface SearchBarProps {
  /**
   * Lo que la barra pregunta, compuesto en el dominio. Llega hecho y no se
   * retoca: es lo que el producto le pregunta a quien llega, no una etiqueta
   * de maquetado, y escrito acá sería una segunda copia que se separa de la
   * primera en cuanto alguien corrija una sola.
   */
  readonly label: string;
  /** A dónde vuelve el `GET`. Lo decide `homeSearchForm`, no este archivo. */
  readonly action: string;
  /** El nombre del parámetro. También del dominio: es contrato de la URL. */
  readonly name: string;
  /** Lo escrito la vez anterior, para que el campo no vuelva vacío. */
  readonly value: string;
  readonly submitLabel: string;
}

/**
 * La caja de búsqueda del inicio.
 *
 * **Un formulario y no un enlace, y eso corrige lo que había.** La versión
 * anterior era un `<a>` hacia `/alquiler/<primera ciudad>`, con este comentario
 * al lado: «no se escribe dentro, se toca y se abre el acordeón». Esa lectura
 * de la lámina dejaba el mecanismo entero sin construir — la barra no traducía
 * nada, sólo mandaba a una ciudad elegida por el `ORDER BY`.
 *
 * **F14: sin JavaScript esto tiene que funcionar igual.** Un `<form
 * method="get">` lo hace el navegador solo: se escribe, se envía, el servidor
 * traduce lo escrito a filtros y **redirige a la dirección canónica**. Las
 * sugerencias mientras se escribe son una mejora encima, nunca el mecanismo —
 * por eso acá no hay ni un manejador de eventos.
 *
 * **Etiqueta real y además `placeholder`.** El `placeholder` desaparece con la
 * primera letra; los lectores de pantalla, el modo de contraste forzado y el
 * autocompletado se apoyan en la asociación `for`/`id`. La lámina dibuja la
 * frase dentro de la píldora, así que la etiqueta va oculta a la vista y
 * presente en el documento.
 *
 * **Ni una regla acá.** Qué se pregunta, a dónde vuelve, cómo se llama el
 * parámetro y qué pasa con lo escrito: todo llega resuelto de
 * `listing-catalogue/domain/search-destination.ts`.
 */
export function SearchBar({ label, action, name, value, submitLabel }: SearchBarProps) {
  return (
    // `<search>` y no `role="search"`: es el elemento de referencia real desde
    // 2023, y el linter de accesibilidad rechaza el rol cuando existe el
    // elemento — un rol pegado a mano es una promesa que el marcado ya cumple.
    <search>
      <form className={styles.bar} method="get" action={action}>
        {/* Decoración: el nombre accesible ya lo da la etiqueta del campo, y
            anunciar un círculo no le agrega nada a quien no lo ve. Es la misma
            decisión que la flecha de `ListingStrip`. */}
        <span className={styles.glyph} aria-hidden="true">
          ◎
        </span>

        <label className={styles.srOnly} htmlFor={FIELD_ID}>
          {label}
        </label>
        <input
          className={styles.input}
          id={FIELD_ID}
          name={name}
          // `search` y no `text`: el teclado del teléfono trae la tecla «buscar»,
          // que es como se envía un formulario de una sola línea sin botón.
          type="search"
          defaultValue={value}
          placeholder={label}
          autoComplete="off"
        />

        <button className={styles.submit} type="submit">
          {submitLabel}
        </button>
      </form>
    </search>
  );
}
