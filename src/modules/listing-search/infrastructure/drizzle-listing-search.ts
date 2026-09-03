import { and, asc, desc, eq, gt, gte, inArray, lte, type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { listings } from "../../../shared/db/schema";
import type {
  ListingSearchPort,
  ListingSearchResult,
} from "../application/ports/listing-search.port";
import { pageWindow } from "../domain/pagination";
import type { ListingAttribute, SearchCriteria } from "../domain/search-criteria";
import type { SearchOrder } from "../domain/search-order";

/**
 * The catalogue read, run where the rows are (task 5.4/5.6).
 *
 * The handle is a constructor argument, not an import, so this exact code
 * runs against Neon in production and against a real Postgres container in
 * tests/integration/listing-search.test.ts (the reasoning is spelled out in
 * listing-publication/infrastructure/drizzle-listing-repository.ts).
 *
 * Three predicates are **unconditional**, and that is the whole design:
 * `city_id`, `status = 'active'` and `expires_at > now()` are appended before
 * any caller-supplied filter and cannot be omitted, because `cityId` is
 * required on the criteria and ni el estado ni la fecha están en ella.
 * `listing_city_status_idx` is (city_id, status), so the pair every query
 * starts with is also the access path.
 *
 * **La frescura son DOS condiciones, no una** (task 21.1, y es la misma regla
 * que `drizzle-sitemap.ts` escribió en la 11.13). El rótulo lo mueve un
 * trabajo programado —`markExpired`, dentro del cron diario `0 13 * * *` de
 * `vercel.json`— y un trabajo programado corre tarde: como un aviso vence a
 * los 30 días de la HORA en que se publicó, entre «vencido por reloj» y
 * «vencido en la base» hay de 0 a casi 24 horas. En ese hueco la fila todavía
 * dice `active`, y sin la fecha el catálogo ofrecía un aviso que ya no está
 * para que un inquilino le escribiera — exactamente el mensaje desperdiciado
 * que la 5.5 dice evitar.
 *
 * **Medido antes de escribirlo, no supuesto**: con 40.000 avisos sembrados el
 * plan es el mismo antes y después —`Bitmap Index Scan` sobre
 * `listing_city_status_idx`, mismos buffers, mismo tiempo—, porque la fecha
 * entra como `Filter` sobre filas que el índice ya acotó y descarta a lo sumo
 * un día de avisos recién vencidos: el trabajo diario limpia el resto. El
 * índice sigue sirviendo y no hace falta tocarlo.
 *
 * **La ventana la decide el dominio** (task 14.10). Este archivo no elige un
 * `LIMIT`: se lo pide a `pageWindow`, que es donde vive el tamaño de página.
 * Un adaptador que eligiera el suyo sería una regla de producto escondida en
 * SQL, y discreparía con la pantalla el día que alguien tocara una sola de
 * las dos.
 */
export type SearchDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Cada atributo declarado con su columna.
 *
 * Anotado como `Record` completo a propósito: un sexto atributo en el dominio
 * rompe la compilación acá en vez de quedar como un filtro que el criterio
 * puede pedir y la consulta ignora en silencio.
 */
const ATTRIBUTE_COLUMNS: Readonly<Record<ListingAttribute, PgColumn>> = {
  hasPowerPlant: listings.hasPowerPlant,
  hasRegularWater: listings.hasRegularWater,
  isFurnished: listings.isFurnished,
  hasSecurity: listings.hasSecurity,
  hasAppliances: listings.hasAppliances,
};

/**
 * El `ORDER BY` de cada orden ofrecido (task 14.47), **y el desempate por `id`
 * en los tres**.
 *
 * Ese `asc(listings.id)` no es cosmético y no se toca: sin un orden total, dos
 * páginas de la misma búsqueda repiten un aviso y se saltan otro, porque
 * `OFFSET` corta sobre el orden que Postgres haya elegido esta vez. Con precio
 * el riesgo es mayor que con fecha — dos avisos con el mismo alquiler son de lo
 * más común, mientras que dos publicados en el mismo instante casi no pasan.
 *
 * Anotado como `Record` completo a propósito, igual que `ATTRIBUTE_COLUMNS`: un
 * cuarto orden en el dominio rompe la compilación acá en vez de quedar como una
 * opción que la pantalla ofrece y la consulta ignora en silencio.
 *
 * **No se ofrece orden por superficie**, y la razón la decidió el fundador:
 * `area_m2` puede faltar, y ordenar por un campo ausente ordena mal y en
 * silencio — los avisos sin metros se irían todos juntos a una punta.
 */
const ORDER_BY: Readonly<Record<SearchOrder, () => readonly SQL[]>> = {
  recent: () => [desc(listings.publishedAt), asc(listings.id)],
  priceAsc: () => [asc(listings.priceUsd), asc(listings.id)],
  priceDesc: () => [desc(listings.priceUsd), asc(listings.id)],
};

/** Ausente es «Recientes», que es como el criterio representa el por defecto. */
function orderBy(order: SearchOrder | undefined): readonly SQL[] {
  return ORDER_BY[order ?? "recent"]();
}

export class DrizzleListingSearch implements ListingSearchPort {
  constructor(private readonly db: SearchDatabase) {}

  async search(criteria: SearchCriteria): Promise<readonly ListingSearchResult[]> {
    const filters = [
      eq(listings.cityId, criteria.cityId),
      // The active-only rule (5.5/5.6). Expired adverts and adverts
      // auto-hidden by reports are the same case here: neither is something
      // a tenant should be able to reach through search.
      eq(listings.status, "active"),
      // Y la fecha, que es la otra mitad de la misma regla (21.1). `now()` es
      // el reloj de Postgres y no uno inyectado: se evalúa en la misma
      // transacción que lee las filas, así que no puede quedar viejo entre
      // que el proceso arranca y la consulta corre.
      gt(listings.expiresAt, sql`now()`),
    ];

    // Varias zonas se combinan con **O** (task 14.6, F4): un aviso entra si
    // está en cualquiera de ellas. `inArray` sobre una lista vacía sería un
    // `IN ()` — por eso `buildSearchCriteria` nunca deja una vacía, y una zona
    // vieja o de otra ciudad ya se cayó antes de llegar acá. La ciudad sigue
    // en el `AND` de arriba, así que una zona ajena que se colara igual no
    // puede traer un aviso de otra parte: acota, nunca amplía.
    if (criteria.zoneIds !== undefined) {
      filters.push(inArray(listings.zoneId, [...criteria.zoneIds]));
    }
    if (criteria.minPriceUsd !== undefined) {
      filters.push(gte(listings.priceUsd, criteria.minPriceUsd));
    }
    if (criteria.maxPriceUsd !== undefined) {
      filters.push(lte(listings.priceUsd, criteria.maxPriceUsd));
    }
    if (criteria.minRooms !== undefined) filters.push(gte(listings.rooms, criteria.minRooms));
    if (criteria.minAreaM2 !== undefined) filters.push(gte(listings.areaM2, criteria.minAreaM2));
    // task 14.8. El tipo llega ya validado contra la lista cerrada del
    // dominio; `eq` contra la columna tipada es la segunda red, en compilación.
    if (criteria.propertyType !== undefined) {
      filters.push(eq(listings.propertyType, criteria.propertyType));
    }
    // task 14.7 — "sólo de dueños" (F6).
    if (criteria.publisherType !== undefined) {
      filters.push(eq(listings.publisherType, criteria.publisherType));
    }
    // task 14.9: los atributos se combinan con **Y** — pedir planta y agua es
    // pedir las dos. Y sólo se compara contra `true`: en estas columnas
    // `false` significa "no lo declaró", no "no lo tiene", así que un
    // `= false` devolvería avisos que sí lo tienen y nunca lo anotaron.
    for (const attribute of criteria.attributes ?? []) {
      filters.push(eq(ATTRIBUTE_COLUMNS[attribute], true));
    }

    const { limit, offset } = pageWindow(criteria.page);

    return (
      this.db
        .select({
          id: listings.id,
          cityId: listings.cityId,
          zoneId: listings.zoneId,
          title: listings.title,
          priceUsd: listings.priceUsd,
          rooms: listings.rooms,
          areaM2: listings.areaM2,
          publisherType: listings.publisherType,
          publishedAt: listings.publishedAt,
        })
        .from(listings)
        .where(and(...filters))
        // Cuál de los tres, y su desempate, en `ORDER_BY` — que es donde
        // quedó escrito por qué el `id` no es cosmético.
        .orderBy(...orderBy(criteria.order))
        .limit(limit)
        .offset(offset)
    );
  }
}
