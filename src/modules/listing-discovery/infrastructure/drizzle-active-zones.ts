import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alias } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { listings, zones } from "../../../shared/db/schema";
import type { ActiveZone, ActiveZonesPort } from "../application/ports/active-zones.port";

/**
 * Las zonas con avisos activos y su conteo, **en UNA consulta y sin ciudad**
 * (tasks.md 14.52).
 *
 * ## Un `GROUP BY` y no una columna por zona
 *
 * Misma razón que `DrizzleFacetedSearch` deja escrita para su faceta de zona:
 * `zone` guarda la jerarquía entera —miles de filas por ciudad— así que una
 * columna por zona es una consulta que crece con la taxonomía. Agrupando salen
 * sólo las zonas **con avisos**, que son decenas. Y el corte no es un `LIMIT`
 * elegido por nadie: es «tener avisos», que es la misma frase que la sugerencia
 * promete.
 *
 * ## El predicado es el de la BÚSQUEDA, y eso no es una coincidencia
 *
 * `status = 'active'` y `expires_at > now()`, que es exactamente lo que filtran
 * `DrizzleListingSearch` y `DrizzleFacetedSearch`. Tiene que ser ése y no otro
 * porque **el destino de una sugerencia es una búsqueda**: la etiqueta dice «9»
 * y el `/alquiler/<ciudad>/<zona>` al que lleva cuenta con ese predicado, así
 * que dos predicados distintos son dos respuestas distintas y la diferencia
 * entre ellas es la mentira que la regla transversal 3 prohíbe.
 *
 * **Y por eso NO lleva la portada completa que exige `DrizzleHomeCollections`.**
 * Aquélla la exige porque su consumidor es una tarjeta —sin derivadas no hay
 * qué dibujar, F9— y su total tiene que contar lo mismo que su tira muestra.
 * Acá el consumidor es un conteo de búsqueda, que tampoco la mira. Copiarla
 * habría sido el error simétrico: ofrecer «7» sobre una pantalla que dice 9.
 *
 * ## Las dos ciudades, y ninguna condición de ciudad
 *
 * En `/` no hay ciudad elegida (14.52), así que la consulta no lleva `city_id`
 * en el `WHERE` — lo lleva en el `SELECT`, que es distinto: cada fila se queda
 * con la suya. El agrupamiento es por **id de zona** y no por nombre, y eso es
 * lo que mantiene separados los dos «Centro» del producto: agrupar por nombre
 * fundiría Maracaibo y Distrito Capital en una sugerencia con la suma de las
 * dos, que llevaría a una ciudad prometiendo los avisos de la otra (D5/14.18).
 * Lo prueba `tests/integration/active-zones.test.ts` con las dos filas puestas.
 *
 * El handle es argumento del constructor y no un import, igual que en los demás
 * adaptadores: este mismo código corre contra Neon en producción y contra un
 * Postgres real en integración.
 */
export type ActiveZonesDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export class DrizzleActiveZones implements ActiveZonesPort {
  constructor(private readonly db: ActiveZonesDatabase) {}

  async listActiveZones(): Promise<readonly ActiveZone[]> {
    // El auto-join de la parroquia, el mismo que `DrizzleCatalogue.listZones` ya
    // corre: es lo que desambigua un nombre repetido (14.18). `leftJoin` y no
    // `innerJoin` — una zona de primer nivel no tiene padre, y con un `inner`
    // desaparecería del vocabulario por no tenerlo.
    const parent = alias(zones, "parent");

    return (
      this.db
        .select({
          id: zones.id,
          name: zones.name,
          cityId: zones.cityId,
          parentName: parent.name,
          // **`mapWith(Number)` no es cosmético**: `count()` es `bigint` y los
          // drivers de Postgres lo devuelven como string. Sin esto la sugerencia
          // llevaría un «3» de texto y cualquier comparación numérica sobre él
          // mentiría sin error y sin que el tipo lo delate — el mismo tropiezo que
          // `countWhere` documenta en la búsqueda facetada.
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(listings)
        .innerJoin(zones, eq(zones.id, listings.zoneId))
        .leftJoin(parent, eq(zones.parentId, parent.id))
        .where(
          and(
            // Las dos condiciones de la frescura, y son dos y no una: `status`
            // deja fuera al oculto y al ya marcado vencido, y el reloj al que
            // nadie marcó todavía. Con una sola, la portada ofrecería una zona
            // cuyos únicos avisos caducaron esta madrugada.
            eq(listings.status, "active"),
            gt(listings.expiresAt, sql`now()`),
          ),
        )
        // Por id de zona. `name` y `city_id` van también porque se seleccionan, y
        // `parent.name` porque viene de otra tabla — Postgres no la deduce de la
        // clave primaria de `zone`.
        .groupBy(zones.id, zones.name, zones.cityId, parent.name)
        // Por nombre, igual que el catálogo. El orden de las sugerencias lo decide
        // después `suggestFilters` sobre lo escrito; éste es sólo el orden estable
        // que evita que dos respuestas iguales lleguen barajadas distinto.
        .orderBy(asc(zones.name))
    );
  }
}
