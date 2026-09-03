import type { SearchOrderMenu } from "@/modules/listing-search/domain/search-order";
import { AppLink } from "../atoms/AppLink";
import styles from "./OrderMenu.module.css";

/**
 * **«Recientes ▾», el orden de la lista** (14.47, lámina 7c: va al lado del
 * conteo — «70 avisos ······ Recientes ▾»).
 *
 * No decide nada: cuáles son los tres órdenes, cuál está puesto y a qué
 * dirección lleva cada uno lo resolvió `listing-search/domain/search-order.ts`.
 * Es la regla permanente del fundador, con la razón mecánica de siempre — el
 * suelo de cobertura del 90 % no llega a `components/`.
 *
 * **Un `<details>` y tres enlaces, sin una línea de JavaScript** (D13/F14). Un
 * `<select onchange>` se dibujaría igual y no navegaría con el script apagado,
 * que es justo el caso que este producto tiene que atender: el navegador dentro
 * de WhatsApp, por donde circulan los avisos. `<details>` es el único
 * desplegable que el navegador abre solo, y **si alguno no lo soportara las
 * tres opciones quedan a la vista**: la única degradación posible acá no borra
 * ninguna función.
 *
 * El estado abierto NO viaja en la dirección, a diferencia del acordeón de
 * filtros (`?filtros=`). Aquél lo necesita porque elegir un filtro devuelve al
 * servidor y hay que seguir filtrando; acá elegir es lo último que se hace, y
 * la lista vuelve con el menú cerrado, que es donde tiene que estar. Un
 * parámetro más sería una dirección más para la misma página.
 *
 * **Se dibuja en los dos anchos, y la lámina sólo lo dibuja en escritorio.** La
 * decisión y su razón: esconderlo por debajo de 768 px no escondería una
 * decoración, borraría la única salida de un estado que la dirección igual
 * puede traer. Un enlace armado en escritorio con `?orden=precio-desc` y pegado
 * en un chat se abre en un teléfono en ese orden, y sin el control ahí no hay
 * forma de volver a «Recientes» que no sea editar la URL a mano. El precedente
 * del proyecto para esconder por ancho (14.53: *«el servidor no sabe el ancho
 * de la pantalla»*) resuelve DÓNDE dibujar algo que existe en los dos lados; no
 * autoriza a quitar una función en uno.
 */
export function OrderMenu({ model }: { readonly model: SearchOrderMenu }) {
  return (
    <details className={styles.menu} data-testid="order-menu">
      {/* La «▾» es un carácter de texto, como el resto de los glifos del
          sistema, y va `aria-hidden`: el estado abierto ya lo anuncia el
          propio `<details>`. */}
      <summary className={styles.current}>
        {model.label}
        <span aria-hidden="true"> ▾</span>
      </summary>

      <ul className={styles.options} aria-label="Ordenar los avisos">
        {model.options.map((option) => (
          <li key={option.label}>
            {/* El puesto sigue siendo un enlace y no un `<span>`: es una
                dirección válida —la canónica, en el caso de «Recientes»— y
                dejarla enlazada es lo que devuelve al orden por defecto desde
                cualquier otro. Que esté puesto se anuncia con `aria-current`,
                no con el color. */}
            <AppLink
              className={styles.option}
              href={option.href}
              aria-current={option.current ? "true" : undefined}
            >
              {option.label}
            </AppLink>
          </li>
        ))}
      </ul>
    </details>
  );
}
