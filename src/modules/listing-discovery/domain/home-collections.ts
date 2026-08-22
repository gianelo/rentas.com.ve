import { buildListingGrid, type GridCard, type GridCover, type GridListing } from "./listing-grid";
import { slugify } from "./listing-url";

/**
 * El inicio: qué colecciones existen, cuáles se dibujan y qué promete cada una.
 *
 * **Todo lo que decide producto está acá y nada de eso está en `app/`.** La
 * regla permanente del fundador es que una regla de negocio nunca vive en el
 * frente, y este archivo es la lista completa de las que el inicio necesita:
 * cuántas tiras hay y con qué criterio se arma cada una, si una tira se
 * renderiza o desaparece, si lleva placa "Ver todos", qué número dice esa placa
 * y a dónde apunta. La página recibe tiras ya resueltas y sólo las dibuja — no
 * hay un `.filter()`, ni un umbral, ni un número literal del otro lado.
 *
 * También por una razón práctica que el módulo de rutas ya escribió: el suelo
 * de cobertura del 90 % llega a `domain/` y no llega a `app/`. Una regla en una
 * página es una regla que ninguna medida alcanza.
 *
 * Puro: recibe filas que alguien más buscó y portadas que alguien más pidió, y
 * no sabe que existe una base de datos.
 */

/**
 * Cinco avisos por tira (F1). Es el número del fundador, y vive acá porque
 * también es el `LIMIT` que el adaptador pide: escrito dos veces, un día son
 * dos números distintos y la placa empieza a mentir sobre cuántos faltan.
 */
export const HOME_STRIP_SIZE = 5;

/**
 * El techo de la tira barata (F1: "hasta $400"). Un entero en dólares enteros,
 * que es como el esquema guarda `price_usd` — no hay centavos que redondear.
 */
export const HOME_BUDGET_CEILING_USD = 400;

export type HomeCollectionKind = "recent" | "city" | "budget";

/** La forma mínima que esta regla necesita de una ciudad del catálogo. */
export interface HomeCity {
  readonly id: string;
  readonly name: string;
}

/**
 * Una colección: lo que el adaptador tiene que ir a buscar, más lo que la tira
 * va a decir de ella.
 *
 * `cityId` y `maxPriceUsd` son `null` y no opcionales a propósito: "esta
 * colección no filtra por ciudad" es una afirmación, y un campo ausente no la
 * hace — deja al adaptador adivinando si el criterio falta o si se olvidó.
 */
export interface HomeCollectionSpec {
  readonly key: string;
  readonly kind: HomeCollectionKind;
  /** El encabezado de la tira, tal como se lee en pantalla. */
  readonly title: string;
  readonly cityId: string | null;
  readonly maxPriceUsd: number | null;
  readonly limit: number;
  /**
   * Dónde vive la colección entera, o `null` cuando el producto todavía no la
   * sirve. Ver `homeCollections` para por qué hoy sólo la ciudad tiene una.
   */
  readonly href: string | null;
}

/**
 * Lo que el puerto devuelve por colección: **sus filas Y su total**.
 *
 * Los dos juntos, siempre. Un puerto que devolviera sólo filas obligaría a la
 * pantalla a contarlas, y contar cinco filas de un `LIMIT 5` da cinco — que es
 * justo el número que la placa NO puede decir.
 */
export interface HomeCollectionPage {
  readonly rows: readonly GridListing[];
  readonly total: number;
}

export interface HomeStripLink {
  readonly href: string;
  /** "Ver los 23", ya compuesto: el número de la placa es una regla, no formato. */
  readonly label: string;
}

export interface HomeStrip {
  readonly key: string;
  readonly title: string;
  readonly cards: readonly GridCard[];
  /** `null` cuando la tira no promete nada más de lo que ya muestra. */
  readonly seeAll: HomeStripLink | null;
}

export interface HomeView {
  readonly strips: readonly HomeStrip[];
  /** Sin ningún aviso activo el inicio pide oferta en vez de mostrar demanda. */
  readonly invitesToPublish: boolean;
}

/**
 * Las cuatro tiras de la F1, y su orden.
 *
 * Recientes primero porque es lo único que cambia entre dos visitas seguidas;
 * después una por ciudad, en el orden del catálogo, porque el producto está
 * aislado por ciudad y ésa es la pregunta que casi todo el mundo trae; el
 * presupuesto al final porque es un filtro y no un lugar.
 *
 * **Las ciudades salen del catálogo y no de una lista escrita acá.** Con dos
 * ciudades son cuatro tiras, que es exactamente lo que dice la F1, pero el día
 * que abra una tercera la tira aparece sola. Una lista fija haría invisible en
 * el inicio a la ciudad recién abierta, y nadie lo notaría hasta que alguien
 * preguntara por qué no hay avisos allá.
 *
 * **Sólo la ciudad tiene dirección propia, y eso es una decisión.** El esquema
 * de URLs que el fundador cerró en la 14.24 escribe `/alquiler/<ciudad>` y no
 * define ninguna dirección para "recientes" ni para "hasta $400" — no son
 * lugares. Mientras no exista una, esas dos tiras no prometen el resto de su
 * colección: un enlace hacia una dirección que el producto no sirve es el mismo
 * enlace roto que la ficha ya se niega a poner en su miga de pan, y que la 11.1
 * se negó a publicar antes de que la ruta existiera.
 *
 * El nombre se pasa por `slugify` — la misma que arma la ruta de un aviso y la
 * misma contra la que `resolveZoneRoute` compara — así que la dirección que
 * sale de acá es la que esa ruta resuelve, sin una segunda regla de acentos.
 */
export function homeCollections(cities: readonly HomeCity[]): readonly HomeCollectionSpec[] {
  return [
    {
      key: "recientes",
      kind: "recent",
      title: "Publicados recientemente",
      cityId: null,
      maxPriceUsd: null,
      limit: HOME_STRIP_SIZE,
      href: null,
    },
    ...cities.map(
      (city): HomeCollectionSpec => ({
        key: `ciudad:${city.id}`,
        kind: "city",
        title: city.name,
        cityId: city.id,
        maxPriceUsd: null,
        limit: HOME_STRIP_SIZE,
        href: `/alquiler/${slugify(city.name)}`,
      }),
    ),
    {
      key: "presupuesto",
      kind: "budget",
      title: `Hasta $${HOME_BUDGET_CEILING_USD}`,
      cityId: null,
      maxPriceUsd: HOME_BUDGET_CEILING_USD,
      limit: HOME_STRIP_SIZE,
      href: null,
    },
  ];
}

/**
 * El inicio entero, resuelto.
 *
 * **Tres reglas viven en este cuerpo, y las tres cargan peso.**
 *
 * 1. *Una colección vacía no se renderiza.* La tira desaparece — no queda un
 *    encabezado sobre nada. Un hueco así no se lee como "no hay avisos de esto"
 *    sino como una página rota, y en el inicio es lo primero que alguien ve del
 *    producto. Vacía incluye a la colección que la F9 dejó sin tarjetas: si
 *    ninguna de sus filas tiene portada, el encabezado anunciaría avisos que
 *    nadie puede ver.
 *
 * 2. *La placa sólo aparece cuando hay algo más que ver.* Dos condiciones, y
 *    las dos son del producto: que la colección tenga a dónde llevar, y que
 *    tenga más avisos de los que la tira muestra. Con menos de cinco no hay
 *    placa porque la colección entera ya está en pantalla, que es la F1
 *    textual.
 *
 * 3. *El número de la placa es el de la colección, nunca el de la pantalla.*
 *    "Ver los 23" dice 23. Componerlo con las tarjetas dibujadas daría "Ver los
 *    5" en toda tira llena — un número que no informa nada y que además ya está
 *    a la vista. Por eso el puerto devuelve el total junto a las filas: contarlo
 *    acá es imposible por construcción.
 *
 * **Lo que NO hace: deduplicar entre tiras (14.23).** Un aviso barato y recién
 * publicado sale en recientes, en su ciudad y en el presupuesto, y las tres
 * están en lo cierto — son tres preguntas distintas con la misma respuesta.
 * Sacarlo de dos para que no se repita dejaría a esas dos contestando mal.
 */
export function buildHome(
  specs: readonly HomeCollectionSpec[],
  collections: ReadonlyMap<string, HomeCollectionPage>,
  covers: ReadonlyMap<string, GridCover>,
  photoBaseUrl: string,
): HomeView {
  const strips: HomeStrip[] = [];

  for (const spec of specs) {
    // Una clave ausente es "no hay", igual que en `coversFor`. Reventar acá
    // convertiría un inicio a medio poblar en un 500.
    const collection = collections.get(spec.key);
    if (!collection) continue;

    // Quién entra, a dónde lleva su tarjeta y de qué derivada sale su portada
    // ya son reglas escritas: se reusan en vez de repetirse, y así la F9 vale
    // igual en el inicio que en la zona.
    const cards = buildListingGrid(collection.rows, covers, photoBaseUrl);
    if (cards.length === 0) continue;

    const hasMore = collection.total > cards.length;

    strips.push({
      key: spec.key,
      title: spec.title,
      cards,
      seeAll:
        spec.href !== null && hasMore
          ? { href: spec.href, label: `Ver los ${collection.total}` }
          : null,
    });
  }

  return {
    strips,
    // Sin una sola tira no hay nada que buscar, y el problema del producto en
    // ese momento no es la demanda sino la oferta.
    invitesToPublish: strips.length === 0,
  };
}
