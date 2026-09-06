import { and, asc, count, eq, inArray } from "drizzle-orm";
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

    // **Dos consultas, no veintiuna** (tasks.md 22.8). El conteo total de
    // fotos por aviso no sale de la fila de la portada —esa fila es la
    // posición 0 y nada más—, así que hace falta una segunda agregación. Las
    // dos corren en paralelo y las dos siguen siendo "una llamada para todos
    // los avisos", que es la garantía que este método ya tenía.
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          listingId: listingPhotos.listingId,
          position: listingPhotos.position,
          name: listingPhotoDerivatives.name,
          key: listingPhotoDerivatives.key,
        })
        .from(listingPhotos)
        .innerJoin(listingPhotoDerivatives, eq(listingPhotoDerivatives.photoId, listingPhotos.id))
        .where(
          and(inArray(listingPhotos.listingId, [...listingIds]), eq(listingPhotos.position, 0)),
        ),
      this.db
        .select({ listingId: listingPhotos.listingId, total: count() })
        .from(listingPhotos)
        .where(inArray(listingPhotos.listingId, [...listingIds]))
        .groupBy(listingPhotos.listingId),
    ]);

    const photoCounts = new Map(totals.map((row) => [row.listingId, Number(row.total)]));

    const covers = new Map<
      string,
      { position: number; keys: Record<string, string>; photoCount: number }
    >();
    for (const row of rows) {
      const existing = covers.get(row.listingId) ?? {
        position: row.position,
        keys: {},
        photoCount: photoCounts.get(row.listingId) ?? 0,
      };
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
    const byPosition = new Map<
      number,
      { position: number; keys: Record<string, string>; photoCount: number }
    >();
    for (const row of rows) {
      const existing = byPosition.get(row.position) ?? {
        position: row.position,
        keys: {},
        // Quien pide todas las fotos ya las tiene contadas por el arreglo que
        // le devuelve `allFor`; se rellena igual para que el campo nunca
        // quede a medio declarar en este puerto.
        photoCount: byPosition.size + 1,
      };
      existing.keys[row.name] = row.key;
      byPosition.set(row.position, existing);
    }
    for (const entry of byPosition.values()) entry.photoCount = byPosition.size;

    return [...byPosition.values()].sort(
      (a, b) => a.position - b.position,
    ) as readonly ListingPhotoView[];
  }
}

/** Reexportado para que una superficie no tenga que importar del otro módulo. */
export type { DerivativeName };
