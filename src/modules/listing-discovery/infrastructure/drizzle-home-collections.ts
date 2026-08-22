import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import type {
  HomeCollectionPage,
  HomeCollectionRequest,
  HomeCollectionRow,
  HomeCollectionsPort,
} from "../application/ports/home-collections.port";
import { REQUIRED_SIZES } from "../domain/listing-grid";

/**
 * Las cuatro colecciones del inicio, **en UNA consulta** (task 14.22).
 *
 * **El costo son los viajes de red, no Postgres, y ésa es toda la razón de este
 * archivo.** Neon es Postgres serverless sobre HTTP: cuatro colecciones
 * resueltas por separado son cuatro viajes, y ninguna tira puede empezar a
 * dibujarse hasta que llega la última. El precedente del repo es
 * `drizzle-faceted-search.ts`, que resuelve seis facetas y un total en una sola
 * pasada con `COUNT(*) FILTER`; acá el instrumento es el otro miembro de la
 * misma familia, `COUNT(*) OVER (PARTITION BY …)`.
 *
 * **Ésta es UNA consulta, y es la segunda de las tres que sirven el inicio**:
 * el catálogo de ciudades, ésta —las filas de todas las colecciones **y** el
 * total de cada una— y `ListingPhotosPort.coversFor(ids)`, que trae las
 * portadas de todas las tarjetas de todas las tiras en una llamada. Ninguna de
 * las tres crece con el catálogo: una quinta ciudad agrega una fila a un
 * `VALUES`, no un viaje de red.
 *
 * **Por qué un `JOIN` contra un `VALUES` y no cuatro `UNION ALL`.** Las
 * colecciones se solapan a propósito (14.23: un aviso barato y reciente sale en
 * tres tiras), así que la relación entre avisos y colecciones es de muchos a
 * muchos — y eso es literalmente un `JOIN`. Escrito así, "el mismo aviso puede
 * salir en dos tiras" deja de ser una regla que alguien tiene que recordar no
 * romper y pasa a ser la forma de la consulta: cada aviso produce una fila por
 * cada colección que lo contiene, y no hay ningún lugar donde deduplicar. Un
 * `UNION ALL` de cuatro ramas daría el mismo resultado repitiendo el `WHERE`
 * base cuatro veces, que es donde los predicados se separan con el tiempo.
 *
 * **`total` y `rows` salen del MISMO predicado, y ése es el punto entero.** La
 * ventana cuenta sobre las filas que ya pasaron el `WHERE`, antes de que
 * `row_number()` recorte a cinco. Contar aparte —otra consulta, otro `WHERE`—
 * es cómo "Ver los 23" termina encima de una página de 21: dos predicados son
 * dos respuestas, y la diferencia entre ellas es la mentira que la regla
 * transversal del producto prohíbe.
 *
 * El handle es argumento del constructor y no un import, igual que en los demás
 * adaptadores: este mismo código corre contra Neon en producción y contra un
 * Postgres real en tests/integration/home-collections.test.ts.
 */
export type HomeCollectionsDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Lo que Postgres devuelve, antes de agrupar por colección. */
interface RawRow {
  readonly clave: string;
  readonly id: string;
  readonly title: string;
  readonly price_usd: number;
  readonly rooms: number;
  readonly area_m2: number;
  readonly publisher_type: "owner" | "broker";
  readonly city_name: string;
  readonly zone_name: string;
  readonly total: number | string;
}

export class DrizzleHomeCollections implements HomeCollectionsPort {
  constructor(private readonly db: HomeCollectionsDatabase) {}

  async collectionsFor(
    requests: readonly HomeCollectionRequest[],
  ): Promise<ReadonlyMap<string, HomeCollectionPage>> {
    // Sin colecciones no hay consulta: un `VALUES` vacío es SQL inválido, y de
    // todas formas la respuesta se sabe.
    if (requests.length === 0) return new Map();

    // Cada colección entra como una fila de datos, no como un pedazo de SQL.
    // Los `::` no son adorno: en un `VALUES` con NULLs, Postgres no puede
    // inferir el tipo de una columna que arranca nula, y la comparación contra
    // `city_id` fallaría en tiempo de ejecución.
    const collections = sql.join(
      requests.map(
        (request) =>
          sql`(${request.key}::text, ${request.cityId}::text, ${request.maxPriceUsd}::integer, ${request.limit}::integer)`,
      ),
      sql`, `,
    );

    // Los tamaños que la F9 exige, como parámetros y no interpolados: la lista
    // es del dominio y esta consulta la lee, nunca la reescribe.
    const requiredSizes = sql.join(
      REQUIRED_SIZES.map((size) => sql`${size}`),
      sql`, `,
    );

    // **Las dos condiciones del `where` base, explicadas acá y no adentro** —
    // un comentario SQL no puede llevar acentos graves sin cerrar esta
    // plantilla, y estas dos razones se pierden si se escriben sin nombrar el
    // código al que se refieren.
    //
    // *Ni ocultos ni vencidos (14.22), y son dos condiciones y no una.*
    // `hidden` es el estado al que llega un aviso reportado. `expired` lo pone
    // un trabajo periódico que todavía no existe: sin mirar `expires_at`, un
    // aviso de hace cuarenta días seguiría en la puerta de entrada del sitio
    // esperando a que alguien lo marque. La moderación pendiente no es un
    // estado de este esquema — la lista cerrada es active | expired | hidden.
    //
    // *La F9, contada y no sólo dibujada.* `buildListingGrid` descarta el aviso
    // sin portada completa; si el conteo no lo descartara también, la placa
    // prometería avisos que la página siguiente tampoco muestra. Y sin esto una
    // tira de cinco llegaría con tres tarjetas cada vez que a un aviso le falta
    // una derivada.
    const query = sql`
      with coleccion (clave, ciudad, techo, tope) as (values ${collections}),
      publicable as (
        select
          l.id, l.title, l.price_usd, l.rooms, l.area_m2, l.publisher_type,
          l.city_id, l.published_at,
          c.name as city_name,
          z.name as zone_name
        from "listing" l
        join "city" c on c.id = l.city_id
        join "zone" z on z.id = l.zone_id
        where
          -- Ni ocultos ni vencidos (14.22). Ver la nota de arriba.
          l.status = 'active'
          and l.expires_at > now()
          -- La F9, contada y no sólo dibujada. Ver la nota de arriba.
          and exists (
            select 1
            from "listing_photo" p
            join "listing_photo_derivative" d on d.photo_id = p.id
            where p.listing_id = l.id
              and p.position = 0
              and d.name in (${requiredSizes})
            group by p.id
            having count(distinct d.name) = ${REQUIRED_SIZES.length}
          )
      ),
      emparejado as (
        select
          co.clave,
          co.tope,
          p.id, p.title, p.price_usd, p.rooms, p.area_m2, p.publisher_type,
          p.city_name, p.zone_name,
          -- El total de la colección, sobre las mismas filas que las de abajo
          -- y antes de recortarlas.
          count(*) over (partition by co.clave) as total,
          -- Lo más nuevo primero, con el id de desempate: los avisos de una
          -- misma carga comparten un mismo now(), y sin desempate Postgres devuelve
          -- el que alcanzó primero — un test que pasa por suerte de orden es
          -- el defecto que este proyecto ya encontró dos veces.
          row_number() over (
            partition by co.clave
            order by p.published_at desc, p.id asc
          ) as puesto
        from coleccion co
        join publicable p
          on (co.ciudad is null or p.city_id = co.ciudad)
         and (co.techo is null or p.price_usd <= co.techo)
      )
      select clave, id, title, price_usd, rooms, area_m2, publisher_type,
             city_name, zone_name, total
      from emparejado
      where puesto <= tope
      order by clave, puesto
    `;

    // `execute` devuelve la forma cruda del driver, y las dos que este proyecto
    // usa —`neon-http` en producción y `node-postgres` en integración— la
    // exponen como `rows`. El tipo genérico del handle no lo sabe, así que la
    // conversión se hace una vez, acá, en vez de repartir `any` por el archivo.
    const result = (await this.db.execute(query)) as unknown as { rows: readonly RawRow[] };

    const pages = new Map<string, { rows: HomeCollectionRow[]; total: number }>();
    for (const row of result.rows) {
      const page = pages.get(row.clave) ?? { rows: [], total: 0 };
      // **`Number` y no el valor pelado.** `count(*)` es `bigint`, y los
      // drivers de Postgres lo devuelven como string: sin esto la placa diría
      // "Ver los 23" con un 23 que es texto, y cualquier aritmética sobre él
      // concatenaría en silencio. Es el mismo tropiezo que `countWhere`
      // documenta en la búsqueda facetada.
      page.total = Number(row.total);
      page.rows.push({
        id: row.id,
        title: row.title,
        priceUsd: row.price_usd,
        rooms: row.rooms,
        areaM2: row.area_m2,
        publisherType: row.publisher_type,
        cityName: row.city_name,
        zoneName: row.zone_name,
      });
      pages.set(row.clave, page);
    }

    return pages as ReadonlyMap<string, HomeCollectionPage>;
  }
}
