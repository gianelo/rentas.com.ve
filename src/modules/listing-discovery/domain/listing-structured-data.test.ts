import { describe, expect, it } from "vitest";
import {
  buildListingStructuredData,
  MIN_INDEXABLE_DESCRIPTION_LENGTH,
  resolveListingIndexing,
  type StructuredDataListing,
  serializeStructuredData,
} from "./listing-structured-data";

const NOW = new Date("2026-08-22T12:00:00.000Z");

/** Una descripción que pasa el umbral, para que el sujeto del test sea otro. */
const LONG_DESCRIPTION =
  "Apartamento luminoso en un edificio de cuatro pisos, con balcón hacia el " +
  "patio interno y cocina independiente. El condominio incluye el agua y la " +
  "vigilancia nocturna. Queda a dos cuadras del mercado y a una parada del " +
  "corredor vial, y el estacionamiento es techado. Se alquila desde el primero " +
  "del mes que viene, con contrato de un año.";

function listing(overrides: Partial<StructuredDataListing> = {}): StructuredDataListing {
  return {
    id: "0f6a1b2c-3d4e-5f60-8a9b-0c1d2e3f4a5b",
    cityName: "Maracaibo",
    zoneName: "Tierra Negra",
    zoneParentName: "Coquivacoa",
    title: "Apartamento 2 habitaciones",
    description: LONG_DESCRIPTION,
    propertyType: "apartamento",
    publisherType: "owner",
    publisherName: "María F.",
    priceUsd: 450,
    rooms: 2,
    bathrooms: 1,
    areaM2: 78,
    parkingSpots: 1,
    hasPowerPlant: true,
    hasRegularWater: false,
    isFurnished: false,
    hasSecurity: true,
    hasAppliances: false,
    status: "active",
    publishedAt: new Date("2026-08-01T00:00:00.000Z"),
    expiresAt: new Date("2026-08-31T00:00:00.000Z"),
    ...overrides,
  };
}

describe("resolveListingIndexing", () => {
  it("indexa un aviso vigente con descripción suficiente", () => {
    expect(resolveListingIndexing(listing(), NOW)).toEqual({
      index: true,
      follow: true,
      reason: "indexable",
    });
  });

  it("saca del índice el aviso cuyo estado ya dice vencido", () => {
    expect(resolveListingIndexing(listing({ status: "expired" }), NOW)).toMatchObject({
      index: false,
      reason: "expired",
    });
  });

  /**
   * **La misma doble condición que el sitemap.** El estado lo mueve un trabajo
   * programado y un trabajo programado se atrasa: en esa ventana la fila dice
   * `active` mientras el aviso ya venció. Mirando sólo el estado, esa página
   * seguiría pidiendo que la indexen.
   */
  it("saca del índice el que todavía dice active pero cuya fecha ya pasó", () => {
    const lapsed = listing({ expiresAt: new Date("2026-08-21T00:00:00.000Z") });

    expect(resolveListingIndexing(lapsed, NOW)).toMatchObject({
      index: false,
      reason: "expired",
    });
  });

  /** Escrito al revés: sólo `active` indexa, así lo desconocido cae afuera. */
  it("saca del índice cualquier estado que no sea active", () => {
    expect(resolveListingIndexing(listing({ status: "hidden" }), NOW).index).toBe(false);
  });

  it("saca del índice un aviso por debajo del umbral de contenido", () => {
    const thin = listing({ description: "Apartamento en alquiler. Llamar." });

    expect(resolveListingIndexing(thin, NOW)).toMatchObject({
      index: false,
      reason: "thin-content",
    });
  });

  /** La frontera se indexa: el umbral es un mínimo, no un "más que". */
  it("indexa una descripción justo en el umbral", () => {
    const exact = listing({ description: "a".repeat(MIN_INDEXABLE_DESCRIPTION_LENGTH) });

    expect(resolveListingIndexing(exact, NOW).index).toBe(true);
  });

  /**
   * Los blancos no compran indexación. Es la forma que trae una importación
   * masiva: un párrafo de dos líneas con tabulaciones y saltos pegados del
   * portal de origen mide 400 caracteres y dice lo mismo que 40.
   */
  it("no cuenta el relleno de espacios como contenido", () => {
    const padded = listing({ description: `Apartamento.${"\n \t".repeat(200)}` });

    expect(resolveListingIndexing(padded, NOW)).toMatchObject({
      index: false,
      reason: "thin-content",
    });
  });

  /**
   * **`follow` siempre, incluso fuera del índice.** Un `nofollow` cortaría el
   * camino del rastreador hacia la página de la zona y hacia el resto de los
   * avisos: sacar una página del índice no es motivo para esconderle el sitio.
   */
  it("deja seguir los enlaces incluso cuando saca la página del índice", () => {
    expect(resolveListingIndexing(listing({ status: "expired" }), NOW).follow).toBe(true);
    expect(resolveListingIndexing(listing({ description: "Corto." }), NOW).follow).toBe(true);
  });

  it("el vencimiento manda sobre el contenido delgado", () => {
    const both = listing({ status: "expired", description: "Corto." });

    expect(resolveListingIndexing(both, NOW).reason).toBe("expired");
  });
});

describe("buildListingStructuredData", () => {
  const BASE = "https://rentas.test";

  it("describe la página como un aviso inmobiliario en su dirección canónica", () => {
    const data = buildListingStructuredData(BASE, listing());

    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("RealEstateListing");
    expect(data.url).toBe(
      "https://rentas.test/alquiler/maracaibo/tierra-negra/apartamento-2-habitaciones-0f6a1b2c-3d4e-5f60-8a9b-0c1d2e3f4a5b",
    );
    expect(data.datePosted).toBe("2026-08-01T00:00:00.000Z");
  });

  it("lanza sin la base del sitio, igual que el sitemap", () => {
    expect(() => buildListingStructuredData("  ", listing())).toThrow();
  });

  it("traduce cada tipo de inmueble al alojamiento que le corresponde", () => {
    const typeOf = (propertyType: string) =>
      (
        buildListingStructuredData(BASE, listing({ propertyType })).mainEntity as {
          "@type": string;
        }
      )["@type"];

    expect(typeOf("apartamento")).toBe("Apartment");
    expect(typeOf("casa")).toBe("House");
    expect(typeOf("quinta")).toBe("SingleFamilyResidence");
    expect(typeOf("habitacion")).toBe("Room");
  });

  /** Lo desconocido cae en el tipo más general, que sigue siendo verdadero. */
  it("deja un tipo que no conoce como alojamiento genérico", () => {
    const data = buildListingStructuredData(BASE, listing({ propertyType: "galpon" }));

    expect((data.mainEntity as { "@type": string })["@type"]).toBe("Accommodation");
  });

  /**
   * **`false` significa "no lo declaró", nunca "no lo tiene"** — la misma regla
   * que la ficha sostiene con los atributos. Publicar `value: false` afirmaría
   * que el inmueble no tiene planta eléctrica, y eso el sistema no lo sabe.
   */
  it("lista sólo los atributos declarados y ninguno de los que faltan", () => {
    const data = buildListingStructuredData(BASE, listing());
    const amenities = (data.mainEntity as { amenityFeature?: readonly { name: string }[] })
      .amenityFeature;

    expect(amenities?.map((feature) => feature.name)).toEqual([
      "Planta eléctrica",
      "Vigilancia 24 h",
      "Estacionamiento",
    ]);
    expect(JSON.stringify(data)).not.toContain("Amoblado");
  });

  it("no declara nada cuando el aviso no declaró ningún atributo", () => {
    const bare = listing({
      hasPowerPlant: false,
      hasSecurity: false,
      parkingSpots: 0,
    });
    const data = buildListingStructuredData(BASE, bare);

    expect(data.mainEntity).not.toHaveProperty("amenityFeature");
  });

  /**
   * Un cero en la ficha se dibuja bajo una etiqueta que le da contexto. En el
   * JSON-LD no hay etiqueta: `floorSize: 0` afirma que el inmueble mide cero
   * metros, y ningún inmueble mide cero metros.
   */
  it("omite las cifras en cero en vez de declararlas", () => {
    const unknown = listing({ rooms: 0, bathrooms: 0, areaM2: 0, parkingSpots: 0 });
    const entity = buildListingStructuredData(BASE, unknown).mainEntity as Record<string, unknown>;

    expect(entity).not.toHaveProperty("numberOfRooms");
    expect(entity).not.toHaveProperty("numberOfBathroomsTotal");
    expect(entity).not.toHaveProperty("floorSize");
  });

  /**
   * **El precio es por mes, y decirlo es el punto entero de la oferta.** Un
   * `price: 450` suelto sobre una vivienda se lee como el precio de venta: tres
   * órdenes de magnitud de diferencia, y es un dato falso publicado por
   * nosotros.
   */
  it("declara el precio como un alquiler mensual en dólares", () => {
    const offer = buildListingStructuredData(BASE, listing()).offers as Record<string, unknown>;

    expect(offer.businessFunction).toBe("http://purl.org/goodrelations/v1#LeaseOut");
    expect(offer.priceSpecification).toMatchObject({
      "@type": "UnitPriceSpecification",
      price: 450,
      priceCurrency: "USD",
      unitCode: "MON",
    });
    expect(offer.availability).toBe("https://schema.org/InStock");
    expect(offer.validThrough).toBe("2026-08-31T00:00:00.000Z");
  });

  it("no ofrece como disponible un aviso vencido", () => {
    const offer = buildListingStructuredData(BASE, listing({ status: "expired" })).offers as Record<
      string,
      unknown
    >;

    expect(offer.availability).toBe("https://schema.org/OutOfStock");
  });

  /**
   * **El teléfono vive detrás del caso de uso de revelación, y el JSON-LD es la
   * superficie más fácil de olvidar.** Un `telephone` acá publicaría en texto
   * plano y legible por máquina justo lo que el producto puso detrás de una
   * cuenta — y ni siquiera haría falta abrir la página para cosecharlo.
   */
  it("no publica el contacto por ninguna vía", () => {
    const serialized = serializeStructuredData(buildListingStructuredData(BASE, listing()));

    expect(serialized).not.toMatch(/telephone|contactPoint|contactMethod|whatsapp/i);
  });

  it("omite a quien publica cuando el aviso no trae su nombre", () => {
    const anonymous = buildListingStructuredData(BASE, listing({ publisherName: null }));

    expect(anonymous).not.toHaveProperty("provider");
    expect(buildListingStructuredData(BASE, listing()).provider).toMatchObject({
      "@type": "Person",
      name: "María F.",
    });
    expect(
      buildListingStructuredData(BASE, listing({ publisherType: "broker" })).provider,
    ).toMatchObject({ "@type": "RealEstateAgent" });
  });

  it("nombra la zona y su padre sin inventar una dirección postal", () => {
    const entity = buildListingStructuredData(BASE, listing()).mainEntity as Record<
      string,
      unknown
    >;

    expect(entity.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Maracaibo",
      addressCountry: "VE",
    });
    expect(entity.containedInPlace).toEqual({
      "@type": "Place",
      name: "Tierra Negra, Coquivacoa",
    });
  });

  /** Los niveles de arriba del árbol no tienen padre, y no se les inventa uno. */
  it("nombra la zona sola cuando no tiene padre", () => {
    const orphan = buildListingStructuredData(BASE, listing({ zoneParentName: null }));

    expect((orphan.mainEntity as Record<string, unknown>).containedInPlace).toEqual({
      "@type": "Place",
      name: "Tierra Negra",
    });
  });

  /**
   * Sin base pública las direcciones salen relativas, y una imagen relativa en
   * un JSON-LD es una imagen rota declarada como buena.
   */
  it("sólo declara imágenes cuando las hay y son absolutas", () => {
    expect(buildListingStructuredData(BASE, listing())).not.toHaveProperty("image");
    expect(buildListingStructuredData(BASE, listing(), { images: [] })).not.toHaveProperty("image");
    expect(
      buildListingStructuredData(BASE, listing(), { images: ["foto.jpg", "https://cdn/1.jpg"] })
        .image,
    ).toEqual(["https://cdn/1.jpg"]);
  });
});

describe("serializeStructuredData", () => {
  /**
   * La descripción la escribe quien publica. Sin escapar el `<`, un
   * `</script>` adentro del texto cierra la etiqueta y lo que sigue deja de ser
   * datos para pasar a ser HTML del documento.
   */
  it("no deja que una descripción cierre la etiqueta que la contiene", () => {
    const hostile = listing({ description: `${LONG_DESCRIPTION}</script><img src=x>` });
    const serialized = serializeStructuredData(
      buildListingStructuredData("https://rentas.test", hostile),
    );

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<img");
    expect(JSON.parse(serialized).description).toContain("</script>");
  });
});
