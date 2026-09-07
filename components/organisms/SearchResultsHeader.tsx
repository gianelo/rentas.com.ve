import type { SearchOrderMenu } from "@/modules/listing-search/domain/search-order";
import type { FilterChip } from "@/modules/listing-search/domain/search-panel";
import { AppLink } from "../atoms/AppLink";
import { FilterChips } from "../molecules/FilterChips";
import { OrderMenu } from "../molecules/OrderMenu";
import styles from "./SearchResultsHeader.module.css";

/** Un paso de la miga de pan. El último de la lista no lleva `href`: es la
 * página en la que se está parado, y por eso se dibuja como texto y no como
 * enlace — llevarlo a un enlace hacia sí misma no es un paso hacia ningún
 * lado. */
export interface SearchResultsCrumb {
  readonly label: string;
  readonly href?: string;
}

/** El aviso que va sobre el conteo — «Sólo en …» en la ciudad, o el que avisa
 * que se ignoró un `?zona=` que no correspondía, en la zona. `live` decide si
 * lleva `role="status"`: la ciudad lo dice desde que la ruta se resolvió y no
 * hace falta anunciarlo; la zona lo dice como reacción a algo que la
 * dirección pedía y sí. */
export interface SearchResultsNotice {
  readonly text: string;
  readonly live?: boolean;
}

export interface SearchResultsHeaderProps {
  readonly crumbs: readonly SearchResultsCrumb[];
  readonly title: string;
  readonly notice?: SearchResultsNotice | null;
  readonly priceNotices?: readonly string[];
  readonly countText: string;
  /** Sin ella no se dibuja el menú de orden — el arnés de medición mide sólo
   * el encabezado y no lo necesita (tasks.md 14.29). */
  readonly orderMenu?: SearchOrderMenu;
  readonly chips: readonly FilterChip[];
  readonly clearAllHref: string;
}

/**
 * **El encabezado de las dos pantallas de resultados, extraído (tasks.md
 * 22.6).** `app/alquiler/[ciudad]/ciudad.module.css` y
 * `app/alquiler/[ciudad]/[zona]/zona.module.css` no diferían en una sola
 * regla de CSS — la única diferencia eran dos comentarios — y los dos
 * `page.tsx` repetían además el mismo bloque de JSX. Es una corrección de
 * duplicación de código, no un átomo nuevo del sistema de diseño: ninguna de
 * las nueve láminas del 2026-08-25 dibuja una miga de pan, así que esta pieza
 * no entra en `SISTEMA.md` como anatomía — entra acá porque las dos pantallas
 * necesitan dibujar exactamente lo mismo desde un solo sitio.
 *
 * **Organismo y no molécula**: compone dos moléculas completas —`FilterChips`
 * y `OrderMenu`— más su propia miga de pan, título y avisos. Una molécula es
 * una pieza; esto es la sección entera que las dos rutas de resultados ponen
 * encima de la cuadrícula.
 *
 * **No decide nada.** El texto del título, el conteo ya formateado y a dónde
 * lleva cada miga los arma quien llama — la regla permanente del fundador es
 * que ninguna decisión de negocio se escribe en `components/`, y el suelo de
 * cobertura del 90 % no llega hasta acá para hacerlo cumplir.
 */
export function SearchResultsHeader({
  crumbs,
  title,
  notice = null,
  priceNotices = [],
  countText,
  orderMenu,
  chips,
  clearAllHref,
}: SearchResultsHeaderProps) {
  return (
    <>
      <nav className={styles.breadcrumb} aria-label="Miga de pan">
        <ol className={styles.crumbs}>
          {crumbs.map((crumb, index) =>
            index === crumbs.length - 1 ? (
              <li key={crumb.label} className={styles.crumb} aria-current="page">
                {crumb.label}
              </li>
            ) : (
              <li key={crumb.label} className={styles.crumb}>
                <AppLink className={styles.crumbLink} href={crumb.href ?? "#"}>
                  {crumb.label}
                </AppLink>
              </li>
            ),
          )}
        </ol>
      </nav>

      <h1 className={styles.title}>{title}</h1>

      {notice === null ? null : (
        <p className={styles.alsoIn} role={notice.live ? "status" : undefined}>
          {notice.text}
        </p>
      )}

      <div className={styles.countRow}>
        <p className={styles.count} data-testid="result-count">
          {countText}
        </p>

        {orderMenu === undefined ? null : <OrderMenu model={orderMenu} />}
      </div>

      {priceNotices.map((text) => (
        <p key={text} className={styles.alsoIn} role="status">
          {text}
        </p>
      ))}

      <FilterChips chips={chips} clearAllHref={clearAllHref} />
    </>
  );
}
