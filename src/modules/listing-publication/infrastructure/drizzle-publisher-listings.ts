import { count, desc, eq } from "drizzle-orm";
import { listingPhotos, listings, zones } from "../../../shared/db/schema";
import type {
  PublisherListingRow,
  PublisherListingsPort,
} from "../application/ports/publisher-listings.port";
import type { PublicationDatabase } from "./drizzle-listing-repository";

/**
 * tasks.md 9.28 — la consulta que `app/mis-avisos/page.tsx` dejó anotada como
 * inexistente («la lista real de avisos necesita una consulta que todavía no
 * existe») y por la que esa pantalla llevaba dos porciones siendo una
 * carcasa.
 *
 * **Una sola consulta, con el conteo de fotos adentro.** El estado de cada
 * aviso y cuántas fotos tiene son las dos cosas que la lámina 14d dibuja en
 * cada ficha; pedirlas por separado sería una consulta más por aviso, que a
 * 88 avisos es 88 viajes para pintar una lista.
 *
 * **`leftJoin` y no `innerJoin` contra `listing_photo`**, que es toda la
 * diferencia entre esta pantalla y cualquier otra: un borrador importado
 * nace con CERO fotos (tasks.md 9.15) y es precisamente el que tiene que
 * salir arriba. Un `innerJoin` habría escondido exactamente los 38 avisos que
 * la lámina pone primero.
 *
 * **El `publisher_id` va en el `WHERE`**, nunca filtrado después en
 * TypeScript — el mismo idioma que `findDraftById` usa con `status =
 * 'draft'` y `findRevealable` con `status = 'active'`. No hay una variante de
 * este método sin ese filtro.
 */
export class DrizzlePublisherListings implements PublisherListingsPort {
  constructor(private readonly db: PublicationDatabase) {}

  async listByPublisher(publisherId: string): Promise<readonly PublisherListingRow[]> {
    const rows = await this.db
      .select({
        id: listings.id,
        title: listings.title,
        priceUsd: listings.priceUsd,
        zoneName: zones.name,
        rooms: listings.rooms,
        areaM2: listings.areaM2,
        publisherType: listings.publisherType,
        externalReference: listings.externalReference,
        status: listings.status,
        expiresAt: listings.expiresAt,
        photoCount: count(listingPhotos.id),
      })
      .from(listings)
      // `zone` es una tabla curada y `listing.zone_id` es NOT NULL, así que
      // esta junta no puede perder filas — pero el nombre de la zona es lo
      // que la ficha muestra, y mostrar un UUID sería peor que no mostrarla.
      .innerJoin(zones, eq(zones.id, listings.zoneId))
      .leftJoin(listingPhotos, eq(listingPhotos.listingId, listings.id))
      .where(eq(listings.publisherId, publisherId))
      .groupBy(listings.id, zones.name)
      // El orden fino —borradores arriba— lo decide el dominio; acá sólo se
      // fija uno estable para que dos avisos del mismo estado no se
      // intercambien entre dos cargas de la misma pantalla.
      .orderBy(desc(listings.publishedAt), desc(listings.id));

    return rows;
  }
}
