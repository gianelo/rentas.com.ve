import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { PgColumn, PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { listings } from "../../../shared/db/schema";
import type {
  ListingSearchPort,
  ListingSearchResult,
} from "../application/ports/listing-search.port";
import { pageWindow } from "../domain/pagination";
import type { ListingAttribute, SearchCriteria } from "../domain/search-criteria";

/**
 * The catalogue read, run where the rows are (task 5.4/5.6).
 *
 * The handle is a constructor argument, not an import, so this exact code
 * runs against Neon in production and against a real Postgres container in
 * tests/integration/listing-search.test.ts (the reasoning is spelled out in
 * listing-publication/infrastructure/drizzle-listing-repository.ts).
 *
 * Two predicates are **unconditional**, and that is the whole design:
 * `city_id` and `status = 'active'` are appended before any caller-supplied
 * filter and cannot be omitted, because `cityId` is required on the criteria
 * and status is not on it at all. `listing_city_status_idx` is (city_id,
 * status), so the pair every query starts with is also the access path.
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

export class DrizzleListingSearch implements ListingSearchPort {
  constructor(private readonly db: SearchDatabase) {}

  async search(criteria: SearchCriteria): Promise<readonly ListingSearchResult[]> {
    const filters = [
      eq(listings.cityId, criteria.cityId),
      // The active-only rule (5.5/5.6). Expired adverts and adverts
      // auto-hidden by reports are the same case here: neither is something
      // a tenant should be able to reach through search.
      eq(listings.status, "active"),
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
        // Newest first, id as the tiebreak. Fixtures published inside the same
        // transaction share a `now()`, and an unordered query would then return
        // whichever row Postgres reached first — a test that passes on ordering
        // luck is the failure this project keeps finding.
        //
        // **Con paginación el desempate deja de ser cosmético.** Sin un orden
        // total, dos páginas de la misma búsqueda pueden repetir un aviso y
        // saltarse otro, porque `OFFSET` corta sobre el orden que Postgres
        // haya elegido esta vez.
        .orderBy(desc(listings.publishedAt), asc(listings.id))
        .limit(limit)
        .offset(offset)
    );
  }
}
