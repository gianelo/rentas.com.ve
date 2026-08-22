import { and, eq, gte, inArray, lte, type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
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
import { LISTING_ATTRIBUTES, type SearchCriteria } from "../domain/search-criteria";

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
 * **`criteria.page` no se mira, y es deliberado** (task 14.10): un conteo es
 * sobre la búsqueda entera y no sobre la pantalla que se está viendo. Es lo
 * que deja saber cuántas páginas hay; un total recortado al `LIMIT` diría
 * siempre "una sola página".
 *
 * El handle es argumento del constructor y no un import, igual que en
 * `DrizzleListingSearch`: este mismo código corre contra Neon en producción y
 * contra un Postgres real en tests/integration/faceted-search.test.ts.
 */
export type FacetedSearchDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Las seis dimensiones que tienen faceta propia, o sea las seis que pueden
 * pedir que se ignore su propio filtro.
 */
type FacetAxis = "zone" | "rooms" | "type" | "publisher" | ListingAttribute;

/** Cada atributo con su columna, igual que en `DrizzleListingSearch`. */
const ATTRIBUTE_COLUMNS: Readonly<Record<ListingAttribute, PgColumn>> = {
  hasPowerPlant: listings.hasPowerPlant,
  hasRegularWater: listings.hasRegularWater,
  isFurnished: listings.isFurnished,
  hasSecurity: listings.hasSecurity,
  hasAppliances: listings.hasAppliances,
};

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

    // Los filtros que SÍ tienen faceta propia quedan fuera del `WHERE` y
    // entran columna por columna. Es la única forma de que la faceta de zona
    // vea las otras zonas y la de habitaciones vea los otros escalones: una
    // opción que no es la elegida tiene que poder decir cuántos habría *si
    // cambiara*, y desde el `WHERE` de afuera esa fila ya no existe.
    //
    // Desde las tasks 14.6 a 14.9 son seis y no dos, y el criterio es el
    // mismo: cada faceta ignora **su propio** filtro y respeta todos los
    // demás. Un filtro nuevo que se quedara en `shared` apagaría su propia
    // faceta — todas las alternativas darían cero y cambiar de opinión
    // parecería imposible.
    const byZoneFilter =
      criteria.zoneIds === undefined ? undefined : inArray(listings.zoneId, [...criteria.zoneIds]);
    const byRoomsFilter =
      criteria.minRooms === undefined ? undefined : gte(listings.rooms, criteria.minRooms);
    const byTypeFilter =
      criteria.propertyType === undefined
        ? undefined
        : eq(listings.propertyType, criteria.propertyType);
    const byPublisherFilter =
      criteria.publisherType === undefined
        ? undefined
        : eq(listings.publisherType, criteria.publisherType);

    const asked = new Set(criteria.attributes ?? []);

    /**
     * Los filtros activos **menos el de la faceta que se está contando**.
     * Sin argumento devuelve todos, que es el total.
     *
     * Para un atributo la exclusión no cambia el número: su filtro y su
     * faceta son la MISMA condición (`columna = true`). Se excluye igual,
     * porque así la regla se escribe una sola vez y sigue valiendo el día que
     * un filtro deje de coincidir exactamente con su faceta.
     */
    const others = (except?: FacetAxis): (SQL | undefined)[] => [
      except === "zone" ? undefined : byZoneFilter,
      except === "rooms" ? undefined : byRoomsFilter,
      except === "type" ? undefined : byTypeFilter,
      except === "publisher" ? undefined : byPublisherFilter,
      ...LISTING_ATTRIBUTES.filter((attribute) => attribute !== except && asked.has(attribute)).map(
        (attribute) => eq(ATTRIBUTE_COLUMNS[attribute], true),
      ),
    ];

    const rows = await this.db
      .select({
        zoneId: listings.zoneId,
        // El total lleva todos: es la búsqueda entera, la que el botón dice.
        total: countWhere(...others()),
        // La faceta de zona ignora la zona elegida y respeta todo lo demás.
        inZone: countWhere(...others("zone")),
        // Las de habitaciones ignoran `minRooms` y respetan el resto. El 4 es
        // "4 o más", igual que el criterio, porque es el mismo filtro.
        rooms1: countWhere(...others("rooms"), gte(listings.rooms, 1)),
        rooms2: countWhere(...others("rooms"), gte(listings.rooms, 2)),
        rooms3: countWhere(...others("rooms"), gte(listings.rooms, 3)),
        rooms4: countWhere(...others("rooms"), gte(listings.rooms, 4)),
        hasPowerPlant: countWhere(...others("hasPowerPlant"), eq(listings.hasPowerPlant, true)),
        hasRegularWater: countWhere(
          ...others("hasRegularWater"),
          eq(listings.hasRegularWater, true),
        ),
        isFurnished: countWhere(...others("isFurnished"), eq(listings.isFurnished, true)),
        hasSecurity: countWhere(...others("hasSecurity"), eq(listings.hasSecurity, true)),
        hasAppliances: countWhere(...others("hasAppliances"), eq(listings.hasAppliances, true)),
        apartamento: countWhere(...others("type"), eq(listings.propertyType, "apartamento")),
        casa: countWhere(...others("type"), eq(listings.propertyType, "casa")),
        quinta: countWhere(...others("type"), eq(listings.propertyType, "quinta")),
        anexo: countWhere(...others("type"), eq(listings.propertyType, "anexo")),
        habitacion: countWhere(...others("type"), eq(listings.propertyType, "habitacion")),
        owner: countWhere(...others("publisher"), eq(listings.publisherType, "owner")),
        broker: countWhere(...others("publisher"), eq(listings.publisherType, "broker")),
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
