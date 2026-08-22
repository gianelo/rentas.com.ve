import { photoAltText, photoUrl } from "./listing-photo-view";
import { buildListingPath } from "./listing-url";

/**
 * Qué avisos entran en la cuadrícula, y con qué.
 *
 * **Tres reglas que estaban repartidas en ninguna parte**, porque hasta ahora
 * la lista dibujaba un rectángulo de CSS en vez de una fotografía: cuál aviso
 * se muestra (F9), a dónde lleva su tarjeta, y de qué derivada sale su
 * portada. Las tres son decisiones del producto, así que viven acá — la
 * pantalla recibe tarjetas ya resueltas y sólo las dibuja.
 *
 * Puro a propósito: recibe las filas que alguien más buscó y el `Map` de
 * portadas que alguien más pidió, y no sabe que existe una base de datos.
 */

/** Un resultado de búsqueda, más los dos nombres que la ruta necesita. */
export interface GridListing {
  readonly id: string;
  readonly title: string;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly areaM2: number;
  readonly publisherType: "owner" | "broker";
  readonly cityName: string;
  readonly zoneName: string;
}

/**
 * La portada tal como la devuelve `ListingPhotosPort.coversFor`. Se declara
 * acá con la forma mínima en vez de importar el puerto: esto es dominio, y no
 * debería depender de la capa que lo llama.
 */
export interface GridCover {
  readonly keys: Readonly<Partial<Record<string, string>>>;
}

export interface GridCardPhoto {
  /** Móvil: la derivada `thumb`, 160×120. */
  readonly thumbUrl: string;
  /** Escritorio: la derivada `card`, 256×192. */
  readonly cardUrl: string;
  readonly alt: string;
}

export interface GridCard {
  readonly id: string;
  readonly href: string;
  readonly priceUsd: number;
  readonly title: string;
  readonly zoneName: string;
  readonly rooms: number;
  readonly areaM2: number;
  readonly publisherType: "owner" | "broker";
  readonly photo: GridCardPhoto;
}

/**
 * Las dos derivadas que una tarjeta dibuja, y **las dos hacen falta**.
 *
 * `thumb` para el teléfono y `card` para el escritorio: la elección del tamaño
 * es de la superficie, que es exactamente lo que el puerto de fotos dice al
 * devolver un `Record` de claves en vez de cinco campos.
 */
/**
 * Exportado desde la 14.22: el inicio tiene que **contar** las colecciones bajo
 * el mismo criterio con el que las dibuja, y ese conteo ocurre en SQL. Con la
 * lista escrita dos veces, el día que aparezca un tercer tamaño obligatorio la
 * placa diría "Ver los 23" sobre una página de 21 — y nada fallaría.
 */
export const REQUIRED_SIZES = ["thumb", "card"] as const;

/**
 * **La regla F9 vive acá: un aviso sin portada no se muestra.**
 *
 * Es la diferencia con la fila que esta cuadrícula reemplaza. Una fila sin
 * miniatura sólo se ve pobre; una tarjeta sin imagen se lee como *rota*, y
 * quien la ve no culpa al aviso sino al sitio. El formulario de publicación ya
 * exige al menos una foto, pero la importación de cartera de la Fase 9 no, así
 * que el caso llega de verdad y no es defensivo.
 *
 * Una portada a la que le falta una de las dos derivadas cae en el mismo saco:
 * el rellenado de la 19a puede dejar un aviso a medio derivar, y media tarjeta
 * con un ícono roto es peor que una tarjeta menos.
 *
 * **El orden se conserva.** El adaptador ya ordena por `published_at`
 * descendente con el id de desempate; reordenar acá sería una segunda regla de
 * orden compitiendo en silencio con la del `ORDER BY`.
 */
export function buildListingGrid(
  listings: readonly GridListing[],
  covers: ReadonlyMap<string, GridCover>,
  photoBaseUrl: string,
): readonly GridCard[] {
  const cards: GridCard[] = [];

  for (const listing of listings) {
    const keys = covers.get(listing.id)?.keys;
    if (!keys) continue;
    if (REQUIRED_SIZES.some((size) => !keys[size]?.trim())) continue;

    cards.push({
      id: listing.id,
      href: buildListingPath({
        cityName: listing.cityName,
        zoneName: listing.zoneName,
        title: listing.title,
        id: listing.id,
      }),
      priceUsd: listing.priceUsd,
      title: listing.title,
      zoneName: listing.zoneName,
      rooms: listing.rooms,
      areaM2: listing.areaM2,
      publisherType: listing.publisherType,
      photo: {
        thumbUrl: photoUrl(photoBaseUrl, keys.thumb as string),
        cardUrl: photoUrl(photoBaseUrl, keys.card as string),
        // **"Foto 1 de 1" es verdad de la tarjeta, no del aviso.** El aviso
        // puede tener seis fotos; `coversFor` devuelve sólo la portada y no
        // trae un total, y pedirlo costaría una agregación por cada búsqueda.
        // El texto describe lo que hay en pantalla, que es una sola imagen —
        // el conteo real lo dice la ficha, donde están las seis.
        alt: photoAltText({
          position: 0,
          total: 1,
          title: listing.title,
          zone: listing.zoneName,
        }),
      },
    });
  }

  return cards;
}
