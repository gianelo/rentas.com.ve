import { and, eq, gte, lte, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import type { PropertyType } from "../../../shared/db/schema";
import { listings } from "../../../shared/db/schema";
import type {
  FacetCounts,
  FacetedSearchPort,
  ListingAttribute,
  PublisherType,
  RoomStep,
} from "../application/ports/faceted-search.port";
import type { SearchCriteria } from "../domain/search-criteria";

/**
 * Cada número que un filtro muestra, en UNA consulta (task 14.11).
 *
 * **El costo son los viajes de red, no Postgres, y ésa es toda la razón de
 * este archivo.** Neon es Postgres serverless sobre HTTP: el total más las
 * seis facetas resueltos por separado son ocho viajes, y eso se siente en cada
 * tecla que alguien toca en un filtro. `COUNT(*) FILTER (WHERE …)` los resuelve
 * en una sola pasada sobre las mismas filas — que es exactamente para lo que el
 * esquema eligió cinco columnas booleanas en vez de una tabla de atributos (ver
 * el comentario de `has_power_plant` en schema.ts). Un cache no sirve acá: F7
 * pide el número **exacto**, y "Ver 47 avisos" sobre una lista de 44 rompe lo
 * único para lo que ese botón existe.
 *
 * **Se agrupa por zona en vez de emitir una columna por zona**, y la razón es
 * el tamaño del árbol: `zone` guarda la jerarquía entera — miles de filas por
 * ciudad — así que una columna por zona ofrecida es una consulta que crece con
 * la taxonomía. Un `GROUP BY zone_id` devuelve una fila por zona *con avisos*,
 * que son pocas; las facetas escalares salen de sumar sus columnas por encima
 * de esos grupos, y sumar cuentas filtradas sobre una partición da exactamente
 * la cuenta filtrada global. Los ceros de las zonas ofrecidas que no aparecen
 * se ponen después, porque una zona sin avisos no tiene fila que agrupar.
 *
 * El handle es argumento del constructor y no un import, igual que en
 * `DrizzleListingSearch`: este mismo código corre contra Neon en producción y
 * contra un Postgres real en tests/integration/faceted-search.test.ts.
 */
export type FacetedSearchDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * `count(*) filter (where …)`, y `count(*)` pelado cuando no hay nada que
 * filtrar — un `filter (where true)` sería igual de correcto y dejaría el plan
 * lleno de ruido que nadie escribió a propósito.
 *
 * `mapWith(Number)` no es cosmético: `count()` es `bigint` y los drivers de
 * Postgres lo devuelven como **string**. Sin esto, `a + b` concatena y el
 * total sale "23" en vez de 5, sin error y sin que el tipo lo delate.
 */
function countWhere(...conditions: readonly (SQL | undefined)[]): SQL<number> {
  const predicate = and(...conditions);
  const expression =
    predicate === undefined ? sql`count(*)` : sql`count(*) filter (where ${predicate})`;
  return expression.mapWith(Number);
}

export class DrizzleFacetedSearch implements FacetedSearchPort {
  constructor(private readonly db: FacetedSearchDatabase) {}

  async countFacets(
    criteria: SearchCriteria,
    offeredZoneIds: readonly string[],
  ): Promise<FacetCounts> {
    // Lo que TODA faceta comparte, y por eso va en el `WHERE` de afuera: la
    // ciudad y el estado son incondicionales — `cityId` es obligatorio en el
    // criterio y el estado no está en el criterio en absoluto (5.5/5.6) — y
    // precio y área no son facetas de este puerto, así que ninguna cuenta
    // tiene motivo para ignorarlos.
    const shared = [eq(listings.cityId, criteria.cityId), eq(listings.status, "active")];
    if (criteria.minPriceUsd !== undefined) {
      shared.push(gte(listings.priceUsd, criteria.minPriceUsd));
    }
    if (criteria.maxPriceUsd !== undefined) {
      shared.push(lte(listings.priceUsd, criteria.maxPriceUsd));
    }
    if (criteria.minAreaM2 !== undefined) {
      shared.push(gte(listings.areaM2, criteria.minAreaM2));
    }

    // Los dos filtros que SÍ tienen faceta propia quedan fuera del `WHERE` y
    // entran columna por columna. Es la única forma de que la faceta de zona
    // vea las otras zonas y la de habitaciones vea los otros escalones: una
    // opción que no es la elegida tiene que poder decir cuántos habría *si
    // cambiara*, y desde el `WHERE` de afuera esa fila ya no existe.
    const byZoneFilter =
      criteria.zoneId === undefined ? undefined : eq(listings.zoneId, criteria.zoneId);
    const byRoomsFilter =
      criteria.minRooms === undefined ? undefined : gte(listings.rooms, criteria.minRooms);

    const rows = await this.db
      .select({
        zoneId: listings.zoneId,
        // El total lleva los dos: es la búsqueda entera, la que el botón dice.
        total: countWhere(byZoneFilter, byRoomsFilter),
        // La faceta de zona ignora la zona elegida y respeta todo lo demás.
        inZone: countWhere(byRoomsFilter),
        // Las de habitaciones ignoran `minRooms` y respetan la zona. El 4 es
        // "4 o más", igual que el criterio, porque es el mismo filtro.
        rooms1: countWhere(byZoneFilter, gte(listings.rooms, 1)),
        rooms2: countWhere(byZoneFilter, gte(listings.rooms, 2)),
        rooms3: countWhere(byZoneFilter, gte(listings.rooms, 3)),
        rooms4: countWhere(byZoneFilter, gte(listings.rooms, 4)),
        // Atributos, tipo y publicador todavía no son criterios (tasks 14.7 a
        // 14.9), así que no tienen filtro propio que ignorar y llevan los dos.
        // El día que lo tengan, cada uno sale de esta lista igual que arriba.
        hasPowerPlant: countWhere(byZoneFilter, byRoomsFilter, eq(listings.hasPowerPlant, true)),
        hasRegularWater: countWhere(
          byZoneFilter,
          byRoomsFilter,
          eq(listings.hasRegularWater, true),
        ),
        isFurnished: countWhere(byZoneFilter, byRoomsFilter, eq(listings.isFurnished, true)),
        hasSecurity: countWhere(byZoneFilter, byRoomsFilter, eq(listings.hasSecurity, true)),
        hasAppliances: countWhere(byZoneFilter, byRoomsFilter, eq(listings.hasAppliances, true)),
        apartamento: countWhere(
          byZoneFilter,
          byRoomsFilter,
          eq(listings.propertyType, "apartamento"),
        ),
        casa: countWhere(byZoneFilter, byRoomsFilter, eq(listings.propertyType, "casa")),
        quinta: countWhere(byZoneFilter, byRoomsFilter, eq(listings.propertyType, "quinta")),
        anexo: countWhere(byZoneFilter, byRoomsFilter, eq(listings.propertyType, "anexo")),
        habitacion: countWhere(
          byZoneFilter,
          byRoomsFilter,
          eq(listings.propertyType, "habitacion"),
        ),
        owner: countWhere(byZoneFilter, byRoomsFilter, eq(listings.publisherType, "owner")),
        broker: countWhere(byZoneFilter, byRoomsFilter, eq(listings.publisherType, "broker")),
      })
      .from(listings)
      .where(and(...shared))
      .groupBy(listings.zoneId);

    const sums = {
      total: 0,
      rooms1: 0,
      rooms2: 0,
      rooms3: 0,
      rooms4: 0,
      hasPowerPlant: 0,
      hasRegularWater: 0,
      isFurnished: 0,
      hasSecurity: 0,
      hasAppliances: 0,
      apartamento: 0,
      casa: 0,
      quinta: 0,
      anexo: 0,
      habitacion: 0,
      owner: 0,
      broker: 0,
    };
    const scalarKeys = Object.keys(sums) as (keyof typeof sums)[];

    // Cada zona ofrecida arranca en cero y se queda en cero si no tiene fila.
    // Es la regla 4 ("ninguna opción lleva a un vacío") hecha dato: la clave
    // ausente le impediría a la pantalla distinguir "no hay" de "no pregunté".
    const byZone: Record<string, number> = {};
    for (const zoneId of offeredZoneIds) byZone[zoneId] = 0;

    for (const row of rows) {
      byZone[row.zoneId] = row.inZone;
      for (const key of scalarKeys) sums[key] += row[key];
    }

    // Las anotaciones `Record<…>` de abajo son el chequeo: un sexto tipo de
    // propiedad o un sexto atributo en el esquema rompe la compilación acá, en
    // vez de dejar viva una faceta que nunca lo cuenta.
    const byMinRooms: Record<RoomStep, number> = {
      1: sums.rooms1,
      2: sums.rooms2,
      3: sums.rooms3,
      4: sums.rooms4,
    };
    const byAttribute: Record<ListingAttribute, number> = {
      hasPowerPlant: sums.hasPowerPlant,
      hasRegularWater: sums.hasRegularWater,
      isFurnished: sums.isFurnished,
      hasSecurity: sums.hasSecurity,
      hasAppliances: sums.hasAppliances,
    };
    const byPropertyType: Record<PropertyType, number> = {
      apartamento: sums.apartamento,
      casa: sums.casa,
      quinta: sums.quinta,
      anexo: sums.anexo,
      habitacion: sums.habitacion,
    };
    const byPublisherType: Record<PublisherType, number> = {
      owner: sums.owner,
      broker: sums.broker,
    };

    return {
      total: sums.total,
      byZone,
      byMinRooms,
      byAttribute,
      byPropertyType,
      byPublisherType,
    };
  }
}
