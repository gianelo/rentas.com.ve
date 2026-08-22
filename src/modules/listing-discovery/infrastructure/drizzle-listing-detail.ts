import { aliasedTable, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { cities, listings, users, zones } from "../../../shared/db/schema";
import type { ListingDetail, ListingDetailPort } from "../application/ports/listing-detail.port";

export type DetailDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** La zona padre, para desambiguar una homónima: `Centro · Coquivacoa`. */
const parentZones = aliasedTable(zones, "parent_zone");

export class DrizzleListingDetail implements ListingDetailPort {
  constructor(private readonly db: DetailDatabase) {}

  /**
   * Una consulta con tres joins, no cuatro consultas.
   *
   * El `leftJoin` contra la zona padre es lo que permite escribir
   * `Centro · Coquivacoa` en la ficha — y hace falta porque en la taxonomía
   * real `Buena Vista` aparece 12 veces y `San José` 11. Es `left` y no `inner`
   * porque los niveles de arriba del árbol no tienen padre, y un `inner` los
   * haría desaparecer sin que nada se queje.
   *
   * **`status` no se filtra acá.** La búsqueda lo filtra sin condiciones porque
   * un aviso vencido en los resultados desperdicia el mensaje de un inquilino;
   * la ficha lo necesita para dibujar su estado vencido, que es una pantalla
   * diseñada. Filtrarlo acá convertiría en 404 una URL que Google ya indexó.
   */
  async findForDetail(listingId: string): Promise<ListingDetail | null> {
    const rows = await this.db
      .select({
        id: listings.id,
        cityId: listings.cityId,
        cityName: cities.name,
        zoneId: listings.zoneId,
        zoneName: zones.name,
        zoneParentName: parentZones.name,
        zoneCategory: zones.category,
        title: listings.title,
        description: listings.description,
        propertyType: listings.propertyType,
        publisherType: listings.publisherType,
        publisherName: users.name,
        priceUsd: listings.priceUsd,
        rooms: listings.rooms,
        bathrooms: listings.bathrooms,
        areaM2: listings.areaM2,
        parkingSpots: listings.parkingSpots,
        hasPowerPlant: listings.hasPowerPlant,
        hasRegularWater: listings.hasRegularWater,
        isFurnished: listings.isFurnished,
        hasSecurity: listings.hasSecurity,
        hasAppliances: listings.hasAppliances,
        contactMethod: listings.contactMethod,
        status: listings.status,
        publishedAt: listings.publishedAt,
        expiresAt: listings.expiresAt,
      })
      .from(listings)
      .innerJoin(cities, eq(cities.id, listings.cityId))
      .innerJoin(zones, eq(zones.id, listings.zoneId))
      .leftJoin(parentZones, eq(parentZones.id, zones.parentId))
      .innerJoin(users, eq(users.id, listings.publisherId))
      // `hidden` no se sirve: es el estado al que llega un aviso reportado, y
      // devolverlo dejaría visible exactamente lo que la moderación quitó.
      .where(eq(listings.id, listingId))
      .limit(1);

    // El resultado se afirma acá y no se infiere: con cuatro joins y una tabla
    // aliaseada, Drizzle no logra derivar la forma y devuelve `never`. El
    // `select` de arriba nombra columna por columna, asi que la afirmacion
    // repite lo que ese objeto ya declara.
    const [row] = rows as unknown as ListingDetail[];

    if (!row) return null;
    // `hidden` no se sirve: es el estado al que llega un aviso reportado, y
    // devolverlo dejaria visible exactamente lo que la moderacion quito.
    if (row.status === "hidden") return null;

    return row;
  }
}
