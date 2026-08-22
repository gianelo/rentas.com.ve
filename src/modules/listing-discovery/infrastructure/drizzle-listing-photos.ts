import { and, asc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { listingPhotoDerivatives, listingPhotos } from "../../../shared/db/schema";
import type { DerivativeName } from "../../listing-publication/application/ports/photo-derivation.port";
import type { ListingPhotosPort, ListingPhotoView } from "../application/ports/listing-photos.port";

export type PhotosDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * El handle se inyecta en vez de importarse, siguiendo a los demás adaptadores:
 * el despliegue le pasa un cliente de Neon y el test de integración uno de
 * `node-postgres` contra un contenedor real, y **los dos corren este mismo
 * código**.
 */
export class DrizzleListingPhotos implements ListingPhotosPort {
  constructor(private readonly db: PhotosDatabase) {}

  /**
   * **Una consulta para los veinte avisos, no veinte consultas.** El join
   * contra `listing_photo_derivative` trae las claves de todos los tamaños de
   * la portada de cada aviso de una vez.
   *
   * `position = 0` en el `WHERE` y no un `ORDER BY … LIMIT 1` por aviso: la
   * portada es la foto que quien publica puso primera, y eso ya está guardado
   * como un número. Ordenar y cortar por cada aviso sería la misma respuesta
   * pagando un `DISTINCT ON` o una ventana.
   */
  async coversFor(listingIds: readonly string[]): Promise<ReadonlyMap<string, ListingPhotoView>> {
    // Sin ids no hay consulta. `inArray` con un arreglo vacío genera SQL que
    // algunos motores rechazan, y de todas formas la respuesta se sabe.
    if (listingIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        listingId: listingPhotos.listingId,
        position: listingPhotos.position,
        name: listingPhotoDerivatives.name,
        key: listingPhotoDerivatives.key,
      })
      .from(listingPhotos)
      .innerJoin(listingPhotoDerivatives, eq(listingPhotoDerivatives.photoId, listingPhotos.id))
      .where(and(inArray(listingPhotos.listingId, [...listingIds]), eq(listingPhotos.position, 0)));

    const covers = new Map<string, { position: number; keys: Record<string, string> }>();
    for (const row of rows) {
      const existing = covers.get(row.listingId) ?? { position: row.position, keys: {} };
      existing.keys[row.name] = row.key;
      covers.set(row.listingId, existing);
    }

    return covers as ReadonlyMap<string, ListingPhotoView>;
  }

  async allFor(listingId: string): Promise<readonly ListingPhotoView[]> {
    const rows = await this.db
      .select({
        photoId: listingPhotos.id,
        position: listingPhotos.position,
        name: listingPhotoDerivatives.name,
        key: listingPhotoDerivatives.key,
      })
      .from(listingPhotos)
      .innerJoin(listingPhotoDerivatives, eq(listingPhotoDerivatives.photoId, listingPhotos.id))
      .where(eq(listingPhotos.listingId, listingId))
      .orderBy(asc(listingPhotos.position));

    // Agrupado acá y no con un `GROUP BY`: Postgres devolvería un arreglo de
    // pares que habría que desarmar igual, y el orden ya viene resuelto.
    const byPosition = new Map<number, { position: number; keys: Record<string, string> }>();
    for (const row of rows) {
      const existing = byPosition.get(row.position) ?? { position: row.position, keys: {} };
      existing.keys[row.name] = row.key;
      byPosition.set(row.position, existing);
    }

    return [...byPosition.values()].sort(
      (a, b) => a.position - b.position,
    ) as readonly ListingPhotoView[];
  }
}

/** Reexportado para que una superficie no tenga que importar del otro módulo. */
export type { DerivativeName };
