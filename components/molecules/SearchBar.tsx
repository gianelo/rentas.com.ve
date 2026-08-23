import { AppLink } from "../atoms/AppLink";
import styles from "./SearchBar.module.css";

export interface SearchBarProps {
  /**
   * Lo que la barra pregunta, compuesto en el dominio. Llega hecho y no se
   * retoca: es lo que el producto le pregunta a quien llega, no una etiqueta
   * de maquetado, y escrito acá sería una segunda copia que se separa de la
   * primera en cuanto alguien corrija una sola.
   */
  readonly label: string;
  /**
   * A dónde lleva, o `null` cuando el producto no tiene ninguna búsqueda que
   * ofrecer. Lo decide `homeSearchBar`, no este archivo.
   */
  readonly href: string | null;
}

/**
 * La barra de búsqueda del inicio.
 *
 * **Va siempre, y eso corrige un error de lectura anterior.** El texto de la
 * F1 sólo la menciona describiendo el inicio sin ningún aviso, y de ahí salió
 * una barra que aparecía únicamente en ese estado. La lámina la dibuja arriba
 * de todo en el artboard `inicio`, con las cuatro tiras debajo: es la primera
 * cosa de la pantalla, haya oferta o no.
 *
 * **Un enlace y no un formulario, que es como la lámina la dibuja.** En los
 * tres estados del artboard «los tres estados de la barra» es un `<AppLink>`: no se
 * escribe dentro, se toca y se abre el acordeón de cuatro pasos. Ese acordeón
 * es otra pantalla y no vive en este archivo; acá sólo está la puerta.
 *
 * **Sin destino deja de ser un enlace.** Un ancla vacía o hacia `#` se ve
 * idéntica a una que funciona y no lleva a ninguna parte — el enlace roto que
 * este repositorio ya se negó a publicar dos veces. En ese estado la barra
 * sigue en pantalla como lo que realmente es: una frase.
 *
 * **Sin JavaScript**, como todo el camino de lectura (D13).
 */
export function SearchBar({ label, href }: SearchBarProps) {
  const content = (
    <>
      {/* Decoración: el nombre accesible ya lo da el texto de al lado, y
          anunciar un círculo no le agrega nada a quien no lo ve. Es la misma
          decisión que la flecha de `ListingStrip`. */}
      <span className={styles.glyph} aria-hidden="true">
        ◎
      </span>
      <span className={styles.label}>{label}</span>
    </>
  );

  if (href === null) {
    return <p className={styles.bar}>{content}</p>;
  }

  return (
    <AppLink className={styles.bar} href={href} data-testid="search-bar">
      {content}
    </AppLink>
  );
}
