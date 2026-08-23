import { buildListingPath } from "./listing-url";

/**
 * Qué se le DECLARA a un buscador sobre un aviso (tareas 11.14, 11.9 y 11.15).
 *
 * Son dos declaraciones y un solo tema, y por eso viven en el mismo módulo: el
 * JSON-LD dice *qué es* esta página, y la directiva de indexación dice *si vale
 * la pena guardarla*. Las dos las lee la misma máquina y las dos tienen que
 * decir lo mismo — un `RealEstateListing` que se declara disponible en una
 * página marcada `noindex` es una contradicción publicada por nosotros.
 *
 * **Es una regla de negocio, no un formateo**, igual que `sitemap.ts` y
 * `zone-route.ts`: decide qué existe a ojos de un buscador. Vive acá por la
 * regla permanente del fundador — una regla de negocio nunca vive en el
 * frente — y por una razón práctica: el suelo de cobertura del 90 % llega a
 * `domain/` y no llega a `app/`, así que una regla escrita en la página es una
 * regla que ninguna corrida de tests puede poner en rojo.
 *
 * **La regla transversal de todo el archivo: nunca declarar un dato que el
 * sistema no sabe.** Es la misma que la ficha ya sostiene con los cinco
 * atributos — `false` significa "no lo declaró", nunca "no lo tiene". Un
 * `schema.org` que afirme lo que el aviso no dice es peor que no ponerlo: lo
 * dice en el formato que una máquina cita sin volver a mirar la página.
 */

/** El aviso, en lo que estas dos declaraciones necesitan de él. */
export interface StructuredDataListing {
  readonly id: string;
  readonly cityName: string;
  readonly zoneName: string;
  readonly zoneParentName: string | null;
  readonly title: string;
  readonly description: string;
  /**
   * Sin tipar contra el esquema a propósito: `domain/` no importa de
   * `shared/db`. Lo que no esté en la tabla de abajo cae en el alojamiento
   * genérico, que sigue siendo verdadero.
   */
  readonly propertyType: string;
  readonly publisherType: "owner" | "broker";
  readonly publisherName: string | null;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly bathrooms: number;
  readonly areaM2: number;
  readonly parkingSpots: number;
  readonly hasPowerPlant: boolean;
  readonly hasRegularWater: boolean;
  readonly isFurnished: boolean;
  readonly hasSecurity: boolean;
  readonly hasAppliances: boolean;
  readonly status: "active" | "expired" | "hidden";
  readonly publishedAt: Date;
  readonly expiresAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// 11.9 y 11.15 — qué páginas pedimos que se indexen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El piso de contenido propio, en caracteres de descripción, para que un aviso
 * merezca un resultado propio en Google (11.15).
 *
 * **Publicar exige 120 y esto exige 300, y la diferencia es el punto.** Aquella
 * regla contesta "¿escribió algo?" y es un piso de formulario: frena el aviso
 * de una línea en el momento de crearlo. Ésta contesta otra pregunta —
 * "¿esta página se sostiene sola como resultado de búsqueda?" — y la contesta
 * sobre avisos que **nunca pasaron por ese formulario**: la importación masiva
 * de carteras entra por otro camino, y cincuenta avisos de dos líneas cada uno
 * son contenido delgado sobre el dominio entero. Google castiga eso en todo el
 * sitio, no sólo en esas páginas.
 *
 * **Por qué 300 y no otro número.** Todo lo demás que la ficha dibuja es
 * plantilla: la tira de cifras, los nombres de los atributos, el bloque de
 * contacto, la miga de pan y el pie se repiten idénticos en cada aviso. El
 * único texto que distingue una ficha de la de al lado es la descripción, así
 * que el umbral tiene que ser el punto donde ese texto pesa más que la
 * plantilla. Trescientos caracteres son unas cincuenta palabras: tres oraciones
 * en español, lo mínimo para decir algo que el título y las cuatro cifras no
 * dijeron ya. Dos veces y media el piso de publicar, y a propósito — un aviso
 * corto sigue siendo un buen aviso para quien llega desde la zona o desde un
 * enlace de WhatsApp. Simplemente no es su propia página de aterrizaje.
 */
export const MIN_INDEXABLE_DESCRIPTION_LENGTH = 300;

export type ListingIndexingReason = "indexable" | "expired" | "thin-content";

export interface ListingIndexing {
  readonly index: boolean;
  /**
   * Siempre `true`, incluso fuera del índice. Sacar una página del índice no es
   * motivo para esconderle el sitio al rastreador: un `nofollow` acá cortaría
   * el camino hacia la página de la zona y hacia los avisos vivos que la ficha
   * vencida enlaza justamente para eso.
   */
  readonly follow: boolean;
  /** Por qué, para que el test y quien lea la página vean la misma razón. */
  readonly reason: ListingIndexingReason;
}

/**
 * Los caracteres que de verdad aportan contenido.
 *
 * Los blancos se colapsan antes de medir porque una importación masiva pega el
 * párrafo del portal de origen con sus tabulaciones y saltos: eso mide 400
 * caracteres y dice lo mismo que 40. Sin colapsar, el relleno compraría
 * indexación.
 */
function contentLength(description: string): number {
  return description.replace(/\s+/g, " ").trim().length;
}

/**
 * Si esta ficha pide entrar al índice de Google.
 *
 * **La ficha vencida SE SIRVE igual** (11.9): tiene su pantalla dibujada y
 * devolver 404 rompería una URL que Google ya indexó. Lo que cambia es lo que
 * se le pide al buscador — servir no es lo mismo que recomendar, la misma
 * asimetría que `DrizzleSitemap` documenta del otro lado.
 *
 * **La vigencia son DOS condiciones**, idéntico al sitemap: el estado lo mueve
 * un trabajo programado y un trabajo programado se atrasa. En esa ventana la
 * fila dice `active` mientras la ficha ya se dibuja vencida, y mirar sólo el
 * estado dejaría esa página pidiendo que la indexen.
 *
 * Escrito al revés de como se lee — sólo `active` indexa — para que un cuarto
 * estado que alguien agregue mañana caiga afuera del índice y no adentro. Ese
 * descuido no falla en ningún lado.
 *
 * `now` es un parámetro y no `new Date()`: es lo que mantiene la función pura y
 * su test repetible, la misma razón por la que `buildSitemap` recibe la base.
 */
export function resolveListingIndexing(
  listing: Pick<StructuredDataListing, "description" | "status" | "expiresAt">,
  now: Date,
): ListingIndexing {
  const live = listing.status === "active" && listing.expiresAt > now;
  // El vencimiento manda: un aviso vencido no vuelve por escribir más texto.
  if (!live) return { index: false, follow: true, reason: "expired" };

  if (contentLength(listing.description) < MIN_INDEXABLE_DESCRIPTION_LENGTH) {
    return { index: false, follow: true, reason: "thin-content" };
  }

  return { index: true, follow: true, reason: "indexable" };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11.14 — qué le decimos a schema.org que es esta página
// ─────────────────────────────────────────────────────────────────────────────

type JsonValue = string | number | boolean | JsonObject | readonly JsonValue[];

interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface ListingStructuredData extends JsonObject {
  readonly "@context": "https://schema.org";
  readonly "@type": "RealEstateListing";
}

/**
 * De tipo de inmueble a tipo de schema.org.
 *
 * **`Accommodation` es el respaldo y es verdadero**, no un descarte: describe
 * un lugar donde se puede vivir, que es lo único que se sabe de un tipo que
 * esta tabla no lista. Un `anexo` cae ahí a propósito — es una unidad
 * independiente pegada a una casa, y llamarlo `Apartment` sería precisar algo
 * que el dato no dice.
 */
const ACCOMMODATION_TYPE: Record<string, string> = {
  apartamento: "Apartment",
  casa: "House",
  // Subtipo de `House`: una quinta es una vivienda unifamiliar aislada.
  quinta: "SingleFamilyResidence",
  anexo: "Accommodation",
  // Subtipo de `Accommodation`: una habitación adentro de otra vivienda.
  habitacion: "Room",
};

/** Los cinco atributos, con el nombre que la ficha ya les imprime. */
const DECLARED_FEATURES: readonly (readonly [keyof StructuredDataListing, string])[] = [
  ["hasPowerPlant", "Planta eléctrica"],
  ["hasRegularWater", "Agua regular"],
  ["isFurnished", "Amoblado"],
  ["hasSecurity", "Vigilancia 24 h"],
  ["hasAppliances", "Electrodomésticos"],
];

export interface StructuredDataOptions {
  /**
   * Las fotos, ya absolutas. Opcional porque `ListingDetail` no las trae: viven
   * en otro puerto, y la ficha las tiene a mano cuando dibuja.
   */
  readonly images?: readonly string[];
}

/**
 * El JSON-LD de la ficha (11.14).
 *
 * **Por qué `RealEstateListing` y no `Product`.** `Product` es la ficha de algo
 * que se vende, y sus resultados enriquecidos viven bajo las políticas de
 * compras de Google: esperan `sku`, marca y reseñas, y un `availability:
 * InStock` sobre una vivienda es una afirmación que este sistema no hace.
 * Marcar como producto lo que no lo es es exactamente lo que dispara una acción
 * manual por datos estructurados — y esa penalización cae sobre el dominio
 * entero. `RealEstateListing` es un subtipo de `WebPage`: dice lo que esta
 * página *es*, que es un aviso inmobiliario, sin prometer un formato de
 * resultado que después no aparezca.
 *
 * **Por qué los tres niveles y no uno.** La página es el aviso
 * (`RealEstateListing`), la cosa es el alojamiento (`mainEntity`, un
 * `Apartment` / `House` / `Room` — que es donde viven las habitaciones, los
 * metros y los atributos declarados), y el acto comercial es la oferta
 * (`offers`, con `businessFunction` de arrendamiento). Colapsarlos en un solo
 * nodo obliga a colgar los metros cuadrados de una página web y el precio de
 * una vivienda, y las dos cosas son falsas por separado.
 *
 * **El contacto no está y no puede estar.** `ListingDetail` ni siquiera trae el
 * valor — vive detrás del caso de uso de revelación — y este documento tampoco
 * declara el método. Un `telephone` acá publicaría en texto legible por máquina
 * justo lo que el producto puso detrás de una cuenta, y sin necesidad de abrir
 * la página para cosecharlo.
 *
 * **Tampoco hay `streetAddress`.** El producto nunca pide una dirección exacta:
 * inventarla, aunque fuera el nombre de la zona puesto en ese campo, es
 * declarar un dato que no existe.
 */
export function buildListingStructuredData(
  baseUrl: string,
  listing: StructuredDataListing,
  { images = [] }: StructuredDataOptions = {},
): ListingStructuredData {
  // Ruidoso y a propósito, igual que `buildSitemap`: con la base vacía el
  // documento sale con una `url` relativa, y una `url` relativa en un JSON-LD
  // no identifica nada — el nodo entero queda sin sujeto.
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (base === "") {
    throw new Error(
      "listing-discovery: falta la base del sitio, y sin ella el JSON-LD no identifica la ficha.",
    );
  }

  // La MISMA función que arma el enlace de la tarjeta, la entrada del sitemap y
  // la redirección canónica de la ficha. Que las cuatro salgan de acá es lo que
  // impide declarar como canónica una dirección que la propia ficha redirige.
  const url = `${base}${buildListingPath(listing)}`;

  const amenities = [
    ...DECLARED_FEATURES.filter(([key]) => listing[key] === true).map(([, name]) => name),
    // El estacionamiento entra por la misma puerta: un cero es "no lo declaró".
    ...(listing.parkingSpots > 0 ? ["Estacionamiento"] : []),
  ].map((name) => ({
    "@type": "LocationFeatureSpecification",
    name,
    // Sólo se emite lo declarado, así que el valor es siempre `true`. Nunca sale
    // un `value: false`: eso afirmaría que el inmueble NO lo tiene.
    value: true,
  }));

  const live = listing.status === "active";

  const accommodation: JsonObject = {
    "@type": ACCOMMODATION_TYPE[listing.propertyType] ?? "Accommodation",
    name: listing.title,
    // Las cifras se omiten en cero en vez de declararse. En la ficha un cero se
    // dibuja bajo una etiqueta que le da contexto; acá no hay etiqueta, y
    // `floorSize: 0` afirma que el inmueble mide cero metros.
    ...(listing.rooms > 0 ? { numberOfRooms: listing.rooms } : {}),
    ...(listing.bathrooms > 0 ? { numberOfBathroomsTotal: listing.bathrooms } : {}),
    ...(listing.areaM2 > 0
      ? { floorSize: { "@type": "QuantitativeValue", value: listing.areaM2, unitCode: "MTK" } }
      : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: listing.cityName,
      addressCountry: "VE",
    },
    // La zona va acá y no en la dirección postal: `PostalAddress` no tiene un
    // campo para un sector, y meterla en `addressLocality` diría que el sector
    // es la localidad. Como `Accommodation` es un `Place`, el lugar que la
    // contiene es el campo que existe para esto.
    containedInPlace: {
      "@type": "Place",
      name: listing.zoneParentName
        ? `${listing.zoneName}, ${listing.zoneParentName}`
        : listing.zoneName,
    },
    ...(amenities.length > 0 ? { amenityFeature: amenities } : {}),
  };

  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    // El `@id` ancla el nodo a esta dirección: sin él, dos fichas del mismo
    // sitio son dos nodos anónimos que un consumidor puede fundir en uno.
    "@id": `${url}#aviso`,
    url,
    name: listing.title,
    description: listing.description,
    datePosted: listing.publishedAt.toISOString(),
    // La cosa que el aviso anuncia, separada de la página que la anuncia.
    mainEntity: accommodation,
    ...(listing.publisherName
      ? {
          provider: {
            // El tipo distingue dueño de inmobiliaria, que es una distinción de
            // producto (la placa de la ficha). El NOMBRE es exactamente lo que
            // la página ya imprime; el teléfono es lo que nunca sale del caso
            // de uso de revelación.
            "@type": listing.publisherType === "broker" ? "RealEstateAgent" : "Person",
            name: listing.publisherName,
          },
        }
      : {}),
    // Sin base pública las direcciones de foto salen relativas, y una imagen
    // relativa en un JSON-LD es una imagen rota declarada como buena.
    ...(images.some((image) => image.startsWith("https://"))
      ? { image: images.filter((image) => image.startsWith("https://")) }
      : {}),
    offers: {
      "@type": "Offer",
      url,
      // Arrendar, no vender. Sin esto la oferta se lee como una venta, y el
      // precio de abajo pasa a ser el precio de venta de la vivienda.
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
      // El precio POR MES. Un `price: 450` suelto sobre una vivienda se lee
      // como el precio de venta — tres órdenes de magnitud de diferencia, y es
      // un dato falso publicado por nosotros. `MON` es el código UN/CEFACT de
      // mes; `referenceQuantity` dice que el precio corresponde a UN mes.
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: listing.priceUsd,
        priceCurrency: "USD",
        unitCode: "MON",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
      },
      availability: live ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      // La fecha de vencimiento es un dato conocido, y decirla es lo que evita
      // que un consumidor que guardó este documento siga ofreciendo el aviso
      // después de que caducó.
      validThrough: listing.expiresAt.toISOString(),
    },
  };
}

/**
 * El documento listo para meter adentro de un `<script type="application/ld+json">`.
 *
 * **El escape del `<` es la razón de que esta función exista.** La descripción
 * la escribe quien publica: un `</script>` adentro del texto cierra la etiqueta
 * y todo lo que sigue deja de ser datos para pasar a ser HTML del documento.
 * `<` es JSON válido y se parsea al mismo carácter, así que el dato no
 * cambia — sólo deja de poder escaparse de su propia etiqueta.
 */
export function serializeStructuredData(data: ListingStructuredData): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
