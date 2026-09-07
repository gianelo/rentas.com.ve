import type { GridCard } from "@/modules/listing-discovery/domain/listing-grid";
import type { Pagination } from "@/modules/listing-search/domain/pagination";
import type { SearchOutcome as SearchOutcomeModel } from "@/modules/listing-search/domain/search-exits";
import { AppLink } from "../atoms/AppLink";
import { ListingCard, ListingGrid } from "../molecules/ListingCard";
import { SearchOutcome } from "./SearchOutcome";
import styles from "./SearchResultsList.module.css";

export interface SearchResultsListProps {
  readonly pagination: Pagination;
  /** Arma la dirección de una página, la actual incluida (la paginación son
   * direcciones y nunca botones — D13). Lo decide quien llama porque la ruta
   * base difiere entre la ciudad y la zona. */
  readonly pageHref: (page: number) => string;
  readonly total: number;
  readonly cards: readonly GridCard[];
  readonly outcome: SearchOutcomeModel;
}

/**
 * **La carcasa de resultados de las dos pantallas de búsqueda, extraída
 * (tasks.md 22.6).** La misma corrección de duplicación que
 * `SearchResultsHeader`, sobre la otra mitad de lo que
 * `app/alquiler/[ciudad]/ciudad.module.css` y
 * `app/alquiler/[ciudad]/[zona]/zona.module.css` declaraban dos veces: la
 * página que ya no existe, el vacío, la cuadrícula y la paginación.
 *
 * **Organismo**: compone `ListingGrid`/`ListingCard` y `SearchOutcome` —dos
 * piezas completas, no átomos sueltos— dentro de una sola región de la
 * pantalla.
 *
 * **No decide nada.** Cuál de los cuatro estados dibujar sale de `pagination`
 * y de `cards`/`total`, que ya vienen resueltos por el dominio; acá sólo se
 * elige entre ellos y se escribe el marcado.
 */
export function SearchResultsList({
  pagination,
  pageHref,
  total,
  cards,
  outcome,
}: SearchResultsListProps) {
  return (
    <div className={styles.results}>
      {pagination.beyondEnd ? (
        // La página que ya no existe: el enlace viejo pegado en un chat. Se
        // responde con la salida, no con una cuadrícula vacía sin causa.
        <p className={styles.empty}>
          Esa página ya no existe: la búsqueda tiene {pagination.count}.{" "}
          <AppLink className={styles.pageLink} href={pageHref(pagination.count)}>
            Ver la última
          </AppLink>
          .
        </p>
      ) : total === 0 ? (
        // El vacío explicado, con sus salidas (F11).
        <SearchOutcome model={outcome} />
      ) : cards.length === 0 ? (
        // Contados pero no dibujados: un aviso sin portada no entra en la
        // cuadrícula (F9). El número de arriba sigue siendo el verdadero.
        <p className={styles.empty}>Los avisos de esta página todavía no tienen foto.</p>
      ) : (
        <ListingGrid>
          {cards.map((card) => (
            <li key={card.id}>
              <ListingCard
                href={card.href}
                priceUsd={card.priceUsd}
                title={card.title}
                zone={card.zoneName}
                rooms={card.rooms}
                areaM2={card.areaM2}
                publisherType={card.publisherType}
                photoCount={card.photoCount}
                photo={card.photo}
              />
            </li>
          ))}
        </ListingGrid>
      )}

      {/* Enlaces y ningún botón: son direcciones, y tienen que poder abrirse
          en otra pestaña, guardarse y pegarse (D13). */}
      {pagination.count > 1 && !pagination.beyondEnd ? (
        <nav className={styles.pages} aria-label="Paginación">
          {pagination.previous === null ? null : (
            <AppLink className={styles.pageLink} href={pageHref(pagination.previous)} rel="prev">
              ← Anterior
            </AppLink>
          )}
          <span className={styles.pageStatus}>
            Página {pagination.current} de {pagination.count}
          </span>
          {pagination.next === null ? null : (
            <AppLink className={styles.pageLink} href={pageHref(pagination.next)} rel="next">
              Siguiente →
            </AppLink>
          )}
        </nav>
      ) : null}

      {/* El cierre de la lista (F10). A mitad de una lista paginada el
          dominio devuelve `partial` y esto no dibuja nada, porque todavía
          faltan avisos. */}
      {total > 0 ? <SearchOutcome model={outcome} /> : null}
    </div>
  );
}
