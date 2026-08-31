import type { ContactMethod, PropertyType, ZoneCategory } from "../../../../shared/db/schema";

/**
 * El aviso, tal como la ficha lo dibuja. Un método, una fila.
 *
 * **No es el mismo puerto que el de búsqueda, y la diferencia importa.** Aquél
 * devuelve muchas filas con lo que entra en una tarjeta; éste devuelve una con
 * todo lo que la ficha muestra. Compartirlos obligaría a la búsqueda a traer la
 * descripción y los cinco atributos de veinte avisos para dibujar veinte
 * tarjetas que no los usan.
 *
 * **El contacto NO está acá.** Es deliberado y es la misma garantía que el
 * dominio de contact-reveal ya sostiene: el valor sólo llega a través del caso
 * de uso que registra la revelación, nunca a través de la consulta que dibuja
 * la página. Si estuviera en este tipo, cualquier componente que serialice el
 * aviso lo mandaría al navegador — y esa fuga es silenciosa. Lo único que la
 * ficha necesita del contacto es el MÉTODO, para el label del botón.
 */
export interface ListingDetail {
  readonly id: string;
  readonly cityId: string;
  readonly cityName: string;
  readonly zoneId: string;
  readonly zoneName: string;
  /** La parroquia o el municipio, para desambiguar una zona homónima. */
  readonly zoneParentName: string | null;
  readonly zoneCategory: ZoneCategory | null;
  /**
   * El punto de referencia que escribio quien publica (tasks.md 18.7).
   * `null` cuando no puso ninguna, que es lo normal.
   *
   * **Esta consulta es su UNICO lector, y eso es la garantia entera.** La seña
   * es el campo que reemplaza a Google Places: no esta en `SearchCriteria`, ni
   * en `SEARCH_QUERY_NAMES`, ni en la consulta facetada, ni en el sitemap, ni
   * en `StructuredDataListing`. Ponerla en cualquiera de esos la convertiria
   * en texto libre filtrable o indexable, que es justamente lo que se rechazo
   * a Google Places para evitar: con la ubicacion como texto libre el filtro
   * se vuelve infinito, los conteos por zona desaparecen y no hay pagina de
   * zona que indexar.
   */
  readonly reference: string | null;

  readonly title: string;
  readonly description: string;
  readonly propertyType: PropertyType;
  readonly publisherType: "owner" | "broker";
  /** El nombre de quien publica, como lo muestra el bloque de "quién publica". */
  readonly publisherName: string | null;

  readonly priceUsd: number;
  /** Las cuatro celdas de la tira. Se dibujan siempre, un cero se muestra. */
  readonly rooms: number;
  readonly bathrooms: number;
  readonly areaM2: number;
  readonly parkingSpots: number;

  /**
   * Los cinco. **Registran una declaración, no un hecho**: `false` significa
   * "no lo declaró", nunca "no lo tiene", y la ficha lista sólo lo declarado
   * (F25/R5). Quien lea esto sin este comentario va a renderizar "No amoblado"
   * y va a estar diciendo algo que el sistema no sabe.
   */
  readonly hasPowerPlant: boolean;
  readonly hasRegularWater: boolean;
  readonly isFurnished: boolean;
  readonly hasSecurity: boolean;
  readonly hasAppliances: boolean;

  /** Sólo el método. El valor vive detrás del caso de uso de revelación. */
  readonly contactMethod: ContactMethod;

  readonly status: "active" | "expired" | "hidden";
  readonly publishedAt: Date;
  readonly expiresAt: Date;
}

export interface ListingDetailPort {
  /**
   * `null` cubre inexistente, oculto y borrado por igual: **quien sondea URLs
   * no puede distinguir un aviso que nunca existió de uno que fue dado de
   * baja**, y el llamador tiene una sola rama que atender.
   *
   * Un aviso **vencido SÍ se devuelve**, y esa asimetría es del producto: la
   * ficha tiene un estado vencido dibujado — sin contacto, con la fecha y una
   * salida a los avisos activos de la zona — y devolver `null` lo convertiría
   * en un 404 sobre una URL que Google ya indexó.
   */
  findForDetail(listingId: string): Promise<ListingDetail | null>;
}
