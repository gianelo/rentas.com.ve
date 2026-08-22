/**
 * Cuántos avisos entran en una pantalla, y a qué páginas se puede ir (task
 * 14.10, F10).
 *
 * **El tamaño de página es una decisión de producto, no de la consulta.** Por
 * eso vive acá y no en `DrizzleListingSearch` ni en la página de resultados:
 * un adaptador que elige su propio `LIMIT` es una regla escondida en SQL, y
 * una página que elige el suyo es la misma regla escondida en JSX — con la
 * garantía extra de que las dos van a discrepar el día que alguien toque una
 * sola. El adaptador pide la ventana, la pantalla pide los enlaces, y ninguno
 * de los dos decide nada.
 *
 * Hasta ahora la consulta no llevaba `LIMIT` y devolvía el catálogo entero.
 * Con dos ciudades y unos cientos de avisos eso funcionaba; el modo en que
 * deja de funcionar es silencioso — una respuesta cada vez más grande sobre
 * los teléfonos baratos para los que existe la regla del D13.
 */

/**
 * Veinticuatro, y el número sale de la cuadrícula.
 *
 * `ListingCard.module.css` dibuja **2 columnas en teléfono y 3 en escritorio**.
 * 24 es divisible por las dos, así que la última fila nunca queda coja en
 * ninguna de las dos anchuras: 12 filas en el teléfono, 8 en el escritorio.
 * También mantiene la cantidad de páginas en algo que se puede recorrer — una
 * ciudad de lanzamiento con unos cientos de avisos son unas diez páginas y no
 * treinta.
 */
export const RESULTS_PER_PAGE = 24;

/** Lo que la consulta necesita saber, y nada más. */
export interface PageWindow {
  readonly limit: number;
  readonly offset: number;
}

/** Adónde se puede ir desde la página que se está viendo. */
export interface Pagination {
  /** La que la URL pidió, ya normalizada a un entero ≥ 1. */
  readonly requested: number;
  /** La que realmente se está mostrando: la pedida, recortada al final. */
  readonly current: number;
  /** Cuántas páginas hay. Nunca cero: sin resultados hay una página vacía. */
  readonly count: number;
  readonly previous: number | null;
  readonly next: number | null;
  /**
   * Si la pedida se pasaba del final. La consulta ya devolvió vacío; esto es
   * lo que deja decirlo sin que la pantalla parezca rota.
   */
  readonly beyondEnd: boolean;
}

/**
 * Un número de página siempre usable.
 *
 * Cero, negativo, fraccionario o `NaN` llegan de una URL escrita a mano o de
 * un enlace viejo. Ninguno es un error del visitante que valga una pantalla
 * rota: un `OFFSET` negativo es un error de Postgres, es decir un 500 por un
 * parámetro pegado de un chat.
 */
function normalisePage(page: number | undefined): number {
  if (page === undefined || !Number.isInteger(page) || page < 1) return 1;
  return page;
}

/**
 * La ventana que la consulta pide. `undefined` es la primera página — un
 * criterio sin `page` es el de siempre, y que la ausencia signifique algo sano
 * es lo que deja al adaptador sin ninguna decisión propia.
 */
export function pageWindow(page: number | undefined): PageWindow {
  return { limit: RESULTS_PER_PAGE, offset: (normalisePage(page) - 1) * RESULTS_PER_PAGE };
}

/** Cuántas páginas hacen falta para `total` avisos. Mínimo una. */
export function pageCount(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.ceil(total / RESULTS_PER_PAGE);
}

/** Qué página se está viendo y a cuáles lleva, sabiendo ya el total real. */
export function resolvePagination(page: number | undefined, total: number): Pagination {
  const requested = normalisePage(page);
  const count = pageCount(total);
  // Se recorta al final en vez de tratarse como un 404: la búsqueda existe y
  // tiene resultados, sólo que menos que la última vez que alguien la guardó.
  const current = Math.min(requested, count);

  return {
    requested,
    current,
    count,
    previous: current > 1 ? current - 1 : null,
    next: current < count ? current + 1 : null,
    beyondEnd: requested > count,
  };
}

/**
 * El número de página que trae una URL, o `undefined` si no trae ninguno
 * utilizable — incluido el `1`, porque la ausencia ya significa "la primera"
 * y dos formas de decir lo mismo es una de más.
 *
 * `Number("1e3")` da 1000 y `Number(" 2 ")` da 2; ninguno de los dos es un
 * número de página que alguien haya escrito, así que se exige la forma
 * decimal entera antes de convertir.
 */
export function readPage(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  if (value < 1) return undefined;
  return value === 1 ? undefined : value;
}
