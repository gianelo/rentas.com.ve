import {
  formatListingCount,
  type SearchPillState,
} from "@/modules/listing-catalogue/domain/search-pill";
import { AppLink } from "../atoms/AppLink";
import { FilterIcon, MagnifierIcon } from "../atoms/icons";
import styles from "./SearchPill.module.css";

const FIELD_ID = "pastilla-de-busqueda";

export interface SearchPillProps {
  /** A dónde vuelve el `GET`. Resuelto por quien la usa, no por esta pieza. */
  readonly action: string;
  readonly name: string;
  /** Lo escrito la vez anterior, o el nombre de la zona ya elegida. */
  readonly value: string;
  readonly placeholder: string;
  /** Nombre accesible del botón de la lupa. */
  readonly submitLabel: string;
  /** Ya decidido por `resolveSearchPill` — este componente no elige nada. */
  readonly state: SearchPillState;
  /**
   * A dónde lleva el filtro: la misma URL con el panel abierto desde el
   * servidor (14i, "Cómo se implementa"). Obligatorio cuando `state.kind`
   * es `"selected"` — sin zona no hay filtro que enlazar.
   */
  readonly filtersHref?: string;
}

/**
 * La pastilla de búsqueda (tasks.md 14.30/14.31; diseño §14i — "contrato
 * para todas las pantallas").
 *
 * **Tres piezas dentro de un mismo borde, sin divisores.** El texto abre el
 * buscador de zona, el filtro abre precio/tamaño/quién publica/atributos —
 * ciudad y zona NO están ahí, "eso lo resuelve el texto" — y la lupa busca
 * con lo escrito. La separación entre las tres es el espacio, nunca una
 * barra.
 *
 * **Sin JavaScript es un `<form method="get">`.** El texto es un
 * `input name="zona"`, la lupa su `button type="submit"`, y el filtro un
 * enlace real — no un botón que sólo abre un panel con un script. Con
 * JavaScript, encima: sugerencias mientras se escribe, navegación sin
 * recargar. Ninguna de las dos mejoras vive en este archivo todavía —
 * ver el reporte de aplicación de este trabajo para el porqué.
 *
 * **Ni una regla de producto acá.** Si el filtro aparece, qué dice y de qué
 * color: todo llega ya resuelto de `resolveSearchPill` (AGENTS.md §1). Este
 * componente sólo traduce un estado a marcado.
 */
export function SearchPill({
  action,
  name,
  value,
  placeholder,
  submitLabel,
  state,
  filtersHref,
}: SearchPillProps) {
  return (
    // `<search>` y no `role="search"`, mismo motivo que `SearchBar`: es el
    // elemento de referencia real, y un rol pegado a mano es una promesa
    // que el marcado ya cumple.
    <search>
      <form className={styles.pill} method="get" action={action}>
        <span className={styles.textCol}>
          <label className={styles.srOnly} htmlFor={FIELD_ID}>
            {placeholder}
          </label>
          <input
            id={FIELD_ID}
            className={styles.input}
            type="search"
            name={name}
            defaultValue={value}
            placeholder={placeholder}
            autoComplete="off"
          />
          {state.kind === "selected" ? (
            <span className={styles.count}>{formatListingCount(state.count)}</span>
          ) : null}
        </span>

        {state.kind === "selected" ? (
          // Un enlace real a la misma URL con el panel abierto desde el
          // servidor — no un botón que sólo funciona con el bundle cargado.
          <AppLink
            className={state.filterAccent ? styles.filterAccent : styles.filter}
            href={filtersHref ?? action}
            aria-label={state.filterLabel}
          >
            <FilterIcon />
            <span className={styles.filterWord} aria-hidden="true">
              {state.filterLabel}
            </span>
            {state.filterCount > 0 ? (
              <span
                className={styles.filterCount}
                data-testid="pill-filter-count"
                aria-hidden="true"
              >
                {state.filterCount}
              </span>
            ) : null}
          </AppLink>
        ) : null}

        <button className={styles.submit} type="submit" aria-label={submitLabel}>
          <MagnifierIcon />
        </button>
      </form>
    </search>
  );
}
