import { buildListingGrid, type GridCard, type GridCover, type GridListing } from "./listing-grid";
import { slugify } from "./listing-url";
import { resolveCityRoute } from "./zone-route";

/**
 * El inicio: qué colecciones existen, cuáles se dibujan y qué promete cada una.
 *
 * **Todo lo que decide producto está acá y nada de eso está en `app/`.** La
 * regla permanente del fundador es que una regla de negocio nunca vive en el
 * frente, y este archivo es la lista completa de las que el inicio necesita:
 * cuántas tiras hay y con qué criterio se arma cada una, si una tira se
 * renderiza o desaparece, si lleva placa "Ver todos", qué número dice esa placa
 * y a dónde apunta; qué ciudad nombra `?ciudad=`, qué le pasa a las colecciones
 * cuando hay una elegida, cuál ficha de ciudad está activa y a dónde lleva; qué
 * dice la barra de búsqueda, a dónde apunta, y qué frase de conteo lleva cada
 * tira. La página recibe todo eso ya resuelto y sólo lo dibuja — no hay un
 * `.filter()`, ni un umbral, ni un número literal del otro lado.
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

/**
 * El texto de la barra de búsqueda, tal como la lámina lo escribe.
 *
 * Vive acá y no en el componente por la misma razón que el título de cada
 * tira: es lo que el producto le pregunta a quien llega, no una etiqueta de
 * maquetado. El componente lo recibe y lo dibuja.
 */
export const HOME_SEARCH_LABEL = "¿En qué zona buscás?";

/**
 * El parámetro con el que el inicio recuerda la ciudad elegida (F2).
 *
 * En español y en la query, no en la ruta: la ciudad acá **no** afirma un
 * lugar como sí lo hace `/alquiler/<ciudad>` — es un recorte del inicio, y el
 * inicio sigue siendo el inicio. Escrito una vez porque lo leen las fichas al
 * componer su enlace y la página al resolverlo.
 */
export const HOME_CITY_PARAM = "ciudad";

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
  /**
   * Cuántas zonas distintas hay detrás de la colección **entera**, no de las
   * cinco filas de arriba.
   *
   * Es el segundo número del subtítulo —«23 avisos activos en cuatro
   * zonas»— y viene del puerto por la misma razón que `total`: contar las
   * zonas de un `LIMIT 5` da como mucho cinco, que es justo el número que esa
   * frase no puede decir.
   */
  readonly zoneCount: number;
}

export interface HomeStripLink {
  readonly href: string;
  /** "Ver los 23", ya compuesto: el número de la placa es una regla, no formato. */
  readonly label: string;
}

export interface HomeStrip {
  readonly key: string;
  readonly title: string;
  /**
   * «23 avisos activos en cuatro zonas.», ya compuesto, o `null` cuando esta
   * colección no tiene nada que contar. Ver `stripSubtitle`.
   */
  readonly subtitle: string | null;
  readonly cards: readonly GridCard[];
  /** `null` cuando la tira no promete nada más de lo que ya muestra. */
  readonly seeAll: HomeStripLink | null;
}

/** La barra de búsqueda del inicio, resuelta. */
export interface HomeSearchBar {
  readonly label: string;
  /**
   * `null` cuando el producto no ha abierto en ninguna parte y por lo tanto no
   * hay ninguna búsqueda que ofrecer. La barra se sigue dibujando; lo que no
   * hace es prometer un destino que nadie sirve.
   */
  readonly href: string | null;
}

/** Una ficha de ciudad de la fila que va debajo de la barra (F2). */
export interface HomeCityChip {
  readonly cityId: string;
  readonly label: string;
  readonly href: string;
  readonly selected: boolean;
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
 *
 * ---
 *
 * **Con una ciudad elegida cambia todo, y ése es el aislamiento de ciudad.**
 *
 * La regla es dura: elegida una ciudad, **ninguna** superficie del inicio
 * puede devolver un aviso de la otra. No alcanza con borrar la tira de la otra
 * ciudad — si «recientes» y «hasta $400» siguieran cruzando el catálogo, un
 * aviso de Distrito Capital aparecería en la portada de alguien que dijo
 * Maracaibo. Por eso las tres colecciones que sobreviven llevan `cityId`, y no
 * sólo la que se llama como la ciudad.
 *
 * **Acá esa garantía no tiene red debajo**, y por eso está escrita con este
 * cuidado. En el resto del producto el aislamiento está garantizado dos veces:
 * `ListingSearchPort` no sabe expresar una consulta sin ciudad, y
 * `listing_zone_city_fk` hace físicamente imposible una fila cruzada. Estas
 * colecciones no pasan por ese puerto, y su `cityId` es nulable **a
 * propósito**, porque sin ciudad elegida la tira barata sí cruza el país. La
 * única cosa que separa las dos situaciones es esta función.
 *
 * El techo de precio sobrevive al recorte: «hasta $400 en Maracaibo» son las
 * dos condiciones a la vez, y perder cualquiera de ellas la vuelve otra tira.
 *
 * **Una ciudad que el catálogo no tiene se ignora y el inicio queda completo.**
 * `?ciudad=cualquier-cosa` no puede producir una portada vacía —
 * indistinguible, para quien la mira, de «todavía no hay nada publicado» — ni
 * un `WHERE city_id = 'cualquier-cosa'` garantizado a cero. Es la misma
 * decisión que `resolveSelectedCity` ya tomó del lado del catálogo: un id que
 * nadie curó no es una ciudad.
 */
export function homeCollections(
  cities: readonly HomeCity[],
  selectedCityId: string | null = null,
): readonly HomeCollectionSpec[] {
  // Elegida quiere decir "está en el catálogo". Lo demás es ninguna, y el
  // inicio se dibuja entero.
  const selected = cities.find((city) => city.id === selectedCityId) ?? null;

  // Con una ciudad elegida queda su tira y desaparece la de la otra. La tira no
  // se dibuja vacía: un encabezado «Distrito Capital» dentro de una portada
  // que dice Maracaibo es la contradicción visible de la regla de arriba.
  const cityStrips = selected ? [selected] : cities;

  return [
    {
      key: "recientes",
      kind: "recent",
      title: "Publicados recientemente",
      cityId: selected?.id ?? null,
      maxPriceUsd: null,
      limit: HOME_STRIP_SIZE,
      href: null,
    },
    ...cityStrips.map(
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
      cityId: selected?.id ?? null,
      maxPriceUsd: HOME_BUDGET_CEILING_USD,
      limit: HOME_STRIP_SIZE,
      href: null,
    },
  ];
}

/**
 * Qué ciudad nombra `?ciudad=maracaibo`, o `null` cuando ninguna.
 *
 * **El slug del nombre y no el id**, por la misma razón que `/alquiler/<ciudad>`:
 * un id es un dato interno y no le dice nada a quien lee la dirección antes de
 * tocarla, ni a quien la pega en un grupo de WhatsApp. La traducción reusa
 * `resolveCityRoute` en vez de escribir una segunda regla de acentos — que es
 * cómo dos partes del sistema empiezan a discrepar sobre si «Distrito Capital»
 * y «distrito-capital» son el mismo lugar.
 *
 * **Nunca la primera ciudad**, y ésa es la diferencia con el catálogo. Un
 * `resolveSelectedCity` que cae a la primera contesta «¿qué ve alguien antes de
 * elegir?»; acá la respuesta a esa pregunta es el inicio completo, con las dos
 * ciudades. Caer a la primera dibujaría una ficha marcada que nadie tocó.
 */
export function resolveHomeCity<C extends HomeCity>(
  cities: readonly C[],
  citySlug: string | null | undefined,
): C | null {
  return resolveCityRoute(cities, citySlug ?? "");
}

/**
 * Las fichas de ciudad de la F2, que son la fila debajo de la barra.
 *
 * **Enlaces y no controles, porque el camino de lectura no tiene JavaScript
 * (D13).** Elegir una ciudad es navegar a otra dirección — `/?ciudad=maracaibo`
 * — y eso hace que el estado quede en la URL: se comparte, se marca y el botón
 * «atrás» del navegador funciona sin que nadie lo programe.
 *
 * **La ficha activa quita la ciudad en vez de repetirla.** Es la única salida:
 * sin esto elegir es un camino de ida, y volver al inicio completo depende de
 * que a alguien se le ocurra apretar «atrás».
 *
 * **El enlace lleva la ciudad y nada más, y eso también es la regla.** Al
 * cambiar de ciudad, cualquier zona ya elegida se cae — una zona pertenece a
 * exactamente una ciudad, así que arrastrar «Chacao» hacia Maracaibo produce o
 * bien cero resultados sin explicación, o bien la fuga que el aislamiento de
 * ciudad existe para cerrar. Se cae por construcción: esta dirección se compone
 * desde cero y no encima de la que había.
 */
export function homeCityChips(
  cities: readonly HomeCity[],
  selectedCityId: string | null,
): readonly HomeCityChip[] {
  return cities.map((city) => {
    const selected = city.id === selectedCityId;

    return {
      cityId: city.id,
      label: city.name,
      href: selected ? "/" : `/?${HOME_CITY_PARAM}=${slugify(city.name)}`,
      selected,
    };
  });
}

/**
 * La barra de búsqueda, que **va siempre** y no sólo cuando no hay avisos.
 *
 * **A dónde lleva es una decisión de producto, y hoy es una decisión
 * provisional escrita en un solo lugar.** La lámina la dibuja como un enlace al
 * acordeón de cuatro pasos, y ese acordeón todavía no existe como ruta de esta
 * aplicación. Inventarle una dirección sería publicar el enlace roto que este
 * repositorio ya se negó a poner dos veces — la miga de pan de la ficha deja la
 * ciudad sin enlace por eso mismo, y la 11.1 lo dice textual.
 *
 * Así que apunta a la superficie de búsqueda que el producto **sí** sirve:
 * `/alquiler/<ciudad>`, que desde la 14.24 *es* la búsqueda de esa ciudad. No
 * es un sustituto arbitrario — el primer paso del acordeón de la lámina es
 * justamente «1 · ciudad», y ésta es esa pregunta ya contestada. El día que el
 * acordeón aterrice, lo único que cambia es esta función.
 *
 * **Antes de que nadie elija, la primera del catálogo.** Es la regla que
 * `resolveSelectedCity` ya dejó escrita del otro lado del producto, y lo que
 * importa de ella es que sea una regla dicha en un lugar y no el resultado
 * accidental de un `ORDER BY name` dentro de una página.
 *
 * **Sin ninguna ciudad no hay destino, y la barra lo dice devolviendo `null`.**
 * Ese estado no es defensivo: es «el producto no ha abierto en ninguna parte»,
 * que es exactamente cuando el inicio invita a publicar.
 */
export function homeSearchBar(
  cities: readonly HomeCity[],
  selectedCityId: string | null,
): HomeSearchBar {
  const destination = cities.find((city) => city.id === selectedCityId) ?? cities[0] ?? null;

  return {
    label: HOME_SEARCH_LABEL,
    href: destination ? `/alquiler/${slugify(destination.name)}` : null,
  };
}

/**
 * Los números del uno al nueve, escritos.
 *
 * **De diez en adelante vuelve la cifra**, y el corte no es arbitrario: la
 * palabra ayuda a leer mientras el número es pequeño y estorba en cuanto hay
 * que convertirla de vuelta para compararla con la de al lado. Es la misma
 * convención de redacción que la lámina usa al escribir «en cuatro zonas»
 * junto a «23 avisos».
 *
 * La posición cero no se usa: sin zonas no hay frase que escribir.
 */
const ZONE_WORDS = [
  "cero",
  "una",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
] as const;

/**
 * «23 avisos activos en cuatro zonas.», o `null` cuando no hay nada que contar.
 *
 * **Sólo la tira de una ciudad lo lleva, y la lámina lo dibuja así en los dos
 * anchos.** Contar zonas sólo significa algo cuando la colección está confinada
 * a un lugar: «cuatro zonas» debajo de «Publicados recientemente», que cruza el
 * país, no le contesta ninguna pregunta a nadie — y debajo de «Hasta $400»
 * tampoco, porque un techo de precio no es un lugar.
 *
 * **Los dos números son los de la colección entera, nunca los de la pantalla.**
 * Es la misma regla que la placa «Ver los 23»: componer esta frase con las
 * tarjetas dibujadas daría «5 avisos activos en una zona» en toda tira llena.
 */
function stripSubtitle(kind: HomeCollectionKind, total: number, zoneCount: number): string | null {
  if (kind !== "city") return null;
  if (total <= 0 || zoneCount <= 0) return null;

  const listings = total === 1 ? "1 aviso activo" : `${total} avisos activos`;
  const zones =
    zoneCount === 1 ? "una zona" : `${ZONE_WORDS[zoneCount] ?? String(zoneCount)} zonas`;

  return `${listings} en ${zones}.`;
}

/**
 * El inicio entero, resuelto.
 *
 * **Cuatro reglas viven en este cuerpo, y las cuatro cargan peso.**
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
 * 4. *El subtítulo lo lleva sólo la tira de una ciudad, y sus dos números son
 *    los de la colección.* Ver `stripSubtitle`: contar zonas sólo significa
 *    algo cuando la colección está confinada a un lugar, y componer la frase
 *    con las tarjetas dibujadas la volvería «5 avisos activos en una zona» en
 *    toda tira llena — el mismo defecto que la regla 3 evita en la placa.
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
      // La línea de conteo debajo del encabezado, ya compuesta. Cuál tira la
      // lleva y qué dice lo decide `stripSubtitle`, no el componente.
      subtitle: stripSubtitle(spec.kind, collection.total, collection.zoneCount),
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
