import { and, eq, gt, gte, inArray, lte, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import type { PropertyType } from "../../../shared/db/schema";
import { listings } from "../../../shared/db/schema";
import type {
  BathroomStep,
  FacetCounts,
  FacetedSearchPort,
  ListingAttribute,
  PriceBucketTally,
  PriceRange,
  PublisherType,
  RelaxableFilter,
  RoomStep,
} from "../application/ports/faceted-search.port";
import { PRICE_HISTOGRAM_BUCKETS } from "../domain/price-histogram";
import { LISTING_ATTRIBUTES, type SearchCriteria } from "../domain/search-criteria";
import { attributeCondition } from "./listing-attribute-sql";

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
 * Las dimensiones que pueden pedir que se ignore su propio filtro.
 *
 * **El precio entró a esta lista con F10/F11.** Antes vivía en el `WHERE` de
 * afuera junto con la ciudad y el estado, porque no era faceta de nadie; ahora
 * el vacío tiene que poder decir «sin el precio hay 21», y desde el `WHERE`
 * esas filas ya no existen. Que esté acá no cambia ninguna cuenta anterior:
 * toda faceta que no sea la del precio lo sigue respetando, porque `others`
 * sólo apaga el eje que se le nombra.
 */
type FacetAxis = "zone" | "rooms" | "bathrooms" | "type" | "publisher" | "price" | ListingAttribute;

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

/** Los cubos numerados como los numera `width_bucket`: desde 1, no desde 0. */
const BUCKET_NUMBERS = Array.from({ length: PRICE_HISTOGRAM_BUCKETS }, (_, index) => index + 1);

/** Un cubo crudo: cuántos, y `null` —no ausentes— cuando no hay ningún precio. */
type RawBucket = readonly [count: number, lowestUsd: number | null, highestUsd: number | null];

export class DrizzleFacetedSearch implements FacetedSearchPort {
  constructor(private readonly db: FacetedSearchDatabase) {}

  async countFacets(
    criteria: SearchCriteria,
    offeredZoneIds: readonly string[],
    widenedPrice?: PriceRange,
  ): Promise<FacetCounts> {
    // Lo que TODA faceta comparte, y por eso va en el `WHERE` de afuera: la
    // ciudad y la frescura son incondicionales — `cityId` es obligatorio en el
    // criterio y el estado no está en el criterio en absoluto (5.5/5.6) — y el
    // área no es faceta de este puerto ni filtro que el panel pueda soltar, así
    // que ninguna cuenta tiene motivo para ignorarla.
    //
    // **La frescura son DOS condiciones y las dos van acá** (task 21.1). Que
    // vivan en el `WHERE` compartido es la parte que importa: es el mismo
    // lugar del que sale el total, cada faceta, `cityTotal` y las nueve
    // relajaciones, así que ningún número puede quedarse con la mitad de la
    // regla. Si el reloj estuviera sólo en `DrizzleListingSearch`, la pantalla
    // diría «9 avisos en Chacao» encima de una lista de ocho — y un conteo que
    // discrepa de su propia lista es peor que uno viejo: rompe lo único para
    // lo que ese botón existe (regla transversal 3, «si una etiqueta dice 9,
    // hay 9»). `tests/integration/faceted-search.test.ts` compara cada total
    // contra las filas de la búsqueda equivalente, así que arreglar una sola
    // de las dos consultas no puede pasar en verde.
    const shared = [
      eq(listings.cityId, criteria.cityId),
      eq(listings.status, "active"),
      gt(listings.expiresAt, sql`now()`),
    ];
    if (criteria.minAreaM2 !== undefined) {
      shared.push(gte(listings.areaM2, criteria.minAreaM2));
    }

    // El precio se salió del `WHERE` compartido: es soltable, y un filtro que
    // vive afuera no puede contar cuántos habría sin él.
    const priceFilter = priceWithin(criteria);

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
    const byBathroomsFilter =
      criteria.minBathrooms === undefined
        ? undefined
        : gte(listings.bathrooms, criteria.minBathrooms);
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
      except === "bathrooms" ? undefined : byBathroomsFilter,
      except === "type" ? undefined : byTypeFilter,
      except === "publisher" ? undefined : byPublisherFilter,
      except === "price" ? undefined : priceFilter,
      ...LISTING_ATTRIBUTES.filter((attribute) => attribute !== except && asked.has(attribute)).map(
        attributeCondition,
      ),
    ];

    /**
     * Cuántos quedarían **soltando ese filtro y ningún otro** (F10 y F11).
     *
     * Es literalmente `others(eje)` sin la condición de la faceta: la misma
     * columna que ya se calcula para "cuántos habría si cambiaras a 2
     * habitaciones", preguntada sin escalón. Nueve números más en la misma
     * pasada, contra nueve viajes de red si se preguntaran de a uno.
     */
    const without = (axis: FacetAxis) => countWhere(...others(axis));

    // **Todo menos el filtro de precio**: misma regla que las otras seis
    // facetas, y acá la más decisiva — el histograma existe para que alguien
    // ELIJA un rango, y medido contra el ya elegido las barras caen a cero.
    const priceless = and(...shared, ...others("price"));

    /**
     * **Los dos extremos del eje, calculados UNA vez** en una subconsulta unida
     * por `true` —un producto de una sola fila— y no repetidos adentro de cada
     * columna, que serían veinticuatro evaluaciones del mismo `min`.
     *
     * **El ensanche del borde de arriba no es cosmético**: con un solo precio
     * distinto —una zona chica con cuatro avisos de $400, que es común— el
     * mínimo y el máximo coinciden y `width_bucket` aborta la consulta entera
     * con "lower bound cannot equal upper bound". Sumarle uno mete todo en el
     * primer cubo, que es lo honesto: un solo precio no tiene distribución.
     * Sin filas los dos son nulos y `width_bucket` devuelve nulo sin romperse.
     */
    const bounds = this.db
      .select({
        lowest: sql<number | null>`min(${listings.priceUsd})`.as("lowest"),
        highest: sql<number | null>`case
            when max(${listings.priceUsd}) > min(${listings.priceUsd}) then max(${listings.priceUsd})
            else min(${listings.priceUsd}) + 1
          end`.as("highest"),
      })
      .from(listings)
      .where(priceless)
      .as("price_bounds");

    const bucketOf = sql`width_bucket(${listings.priceUsd}, ${bounds.lowest}, ${bounds.highest}, ${sql.raw(String(PRICE_HISTOGRAM_BUCKETS))})`;

    /**
     * Un cubo con sus tres números en un `jsonb`, en vez de veinticuatro
     * columnas sueltas adentro de un `select` que ya tiene treinta.
     *
     * **`>=` en el último cubo: la trampa de `width_bucket`.** Parte `[lo, hi)`
     * con el borde de arriba ABIERTO, así que el precio máximo cae en el cubo
     * **N+1**, que no existe, y el aviso más caro desaparece del histograma que
     * dice cuál es el más caro. Plegarlo con `least(…, N)` sería peor: `least`
     * **ignora los nulos** y volvería un ocho el cubo nulo de una búsqueda
     * sin filas.
     */
    const bucketCell = (number: number): SQL => {
      const inside =
        number === PRICE_HISTOGRAM_BUCKETS
          ? sql`${bucketOf} >= ${number}`
          : sql`${bucketOf} = ${number}`;
      return sql`jsonb_build_array(
        count(*) filter (where ${inside}),
        min(${listings.priceUsd}) filter (where ${inside}),
        max(${listings.priceUsd}) filter (where ${inside}))`;
    };

    /**
     * **Los ocho cubos se agregan acá y no allá afuera**: la de afuera agrupa
     * por zona, así que un cubo saldría partido y habría que rejuntarlo
     * **sumando conteos pero comparando precios** — una rama que sólo falla
     * cuando dos zonas caen en el mismo cubo, y que agregado entero no existe.
     */
    const priceFacet = this.db
      .select({
        tally: sql<readonly RawBucket[]>`jsonb_build_array(${sql.join(
          BUCKET_NUMBERS.map(bucketCell),
          sql`, `,
        )})`.as("tally"),
      })
      .from(listings)
      .innerJoin(bounds, sql`true`)
      .where(priceless)
      .as("price_facet");

    const rows = await this.db
      .select({
        zoneId: listings.zoneId,
        // Los ocho cubos, iguales en cada fila porque se agregaron aparte
        // (14.12). Se calculan siempre: saltearlos por debajo del piso de doce
        // exigiría saber el total ANTES, o sea otra consulta.
        priceTally: priceFacet.tally,
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
        // **Tres columnas más en el MISMO `select`, no una consulta aparte**
        // (14.45): el costo de este archivo son los viajes de red, y una
        // segunda pasada por las mismas filas para tres números los duplica.
        // El `>=` es la mitad que decide: el escalón «3+» significa tres baños
        // o más, igual que el criterio, porque es el mismo filtro.
        bathrooms1: countWhere(...others("bathrooms"), gte(listings.bathrooms, 1)),
        bathrooms2: countWhere(...others("bathrooms"), gte(listings.bathrooms, 2)),
        bathrooms3: countWhere(...others("bathrooms"), gte(listings.bathrooms, 3)),
        hasPowerPlant: countWhere(...others("hasPowerPlant"), eq(listings.hasPowerPlant, true)),
        hasRegularWater: countWhere(
          ...others("hasRegularWater"),
          eq(listings.hasRegularWater, true),
        ),
        isFurnished: countWhere(...others("isFurnished"), eq(listings.isFurnished, true)),
        // **La sexta columna, y es DERIVADA** (14.45 rebanada C): sale de
        // `parking_spots > 0`, no de un booleano. Va en el MISMO `select` que
        // las otras cinco por la misma razón que los baños — el costo de este
        // archivo son los viajes de red— y **con su propio filtro apagado**,
        // que es lo que deja que su número diga cuántos habría si se cambiara.
        hasParking: countWhere(...others("hasParking"), attributeCondition("hasParking")),
        hasSecurity: countWhere(...others("hasSecurity"), eq(listings.hasSecurity, true)),
        hasAppliances: countWhere(...others("hasAppliances"), eq(listings.hasAppliances, true)),
        apartamento: countWhere(...others("type"), eq(listings.propertyType, "apartamento")),
        casa: countWhere(...others("type"), eq(listings.propertyType, "casa")),
        quinta: countWhere(...others("type"), eq(listings.propertyType, "quinta")),
        anexo: countWhere(...others("type"), eq(listings.propertyType, "anexo")),
        habitacion: countWhere(...others("type"), eq(listings.propertyType, "habitacion")),
        owner: countWhere(...others("publisher"), eq(listings.publisherType, "owner")),
        broker: countWhere(...others("publisher"), eq(listings.publisherType, "broker")),
        // Las nueve relajaciones, más el techo siguiente y la ciudad pelada.
        withoutZone: without("zone"),
        withoutPrice: without("price"),
        withoutRooms: without("rooms"),
        withoutBathrooms: without("bathrooms"),
        withoutPublisher: without("publisher"),
        withoutPowerPlant: without("hasPowerPlant"),
        withoutRegularWater: without("hasRegularWater"),
        withoutFurnished: without("isFurnished"),
        withoutParking: without("hasParking"),
        withoutSecurity: without("hasSecurity"),
        withoutAppliances: without("hasAppliances"),
        // El precio ampliado un escalón: el resto de los filtros siguen. Sin
        // pedido, repite el total y nadie lo lee — la respuesta se omite.
        widened: countWhere(...others("price"), priceWithin(widenedPrice ?? criteria)),
        // La ciudad sin un solo filtro del panel: el número de «Limpiar todo».
        cityTotal: countWhere(),
        // **Sólo para decidir si esta zona se ofrece**, no para ofrecerla con
        // un número: una zona entra en `byZone` cuando tiene algún aviso
        // dentro del precio y el área, que es la fila que este `GROUP BY`
        // devolvía cuando el precio todavía vivía en el `WHERE` de afuera.
        withinPrice: countWhere(priceFilter),
      })
      .from(listings)
      // El histograma entra ya agregado, y su subconsulta devuelve UNA fila
      // siempre —un agregado sin `group by` la devuelve incluso sobre cero
      // filas—, así que unir por `true` no toca ninguna cuenta anterior.
      .innerJoin(priceFacet, sql`true`)
      .where(and(...shared))
      // El arreglo entra al `group by` porque es una columna pelada en un
      // `select` agrupado, no porque parta nada: tiene UN solo valor.
      .groupBy(listings.zoneId, priceFacet.tally);

    const sums = {
      total: 0,
      withoutZone: 0,
      withoutPrice: 0,
      withoutRooms: 0,
      withoutBathrooms: 0,
      withoutPublisher: 0,
      withoutPowerPlant: 0,
      withoutRegularWater: 0,
      withoutFurnished: 0,
      withoutParking: 0,
      withoutSecurity: 0,
      withoutAppliances: 0,
      widened: 0,
      cityTotal: 0,
      rooms1: 0,
      rooms2: 0,
      rooms3: 0,
      rooms4: 0,
      bathrooms1: 0,
      bathrooms2: 0,
      bathrooms3: 0,
      hasPowerPlant: 0,
      hasRegularWater: 0,
      isFurnished: 0,
      hasParking: 0,
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
      // La zona se ofrece si tiene algo dentro del precio — con cero avisos
      // dentro nunca fue una opción, y ahora que el precio salió del `WHERE`
      // su fila igual llega. Las ofrecidas ya están puestas en cero arriba.
      if (row.withinPrice > 0) byZone[row.zoneId] = row.inZone;
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
    // Mismo chequeo que el de abajo: un cuarto escalón de baños en el dominio
    // rompe la compilación acá en vez de dejar un botón que nadie cuenta.
    const byMinBathrooms: Record<BathroomStep, number> = {
      1: sums.bathrooms1,
      2: sums.bathrooms2,
      3: sums.bathrooms3,
    };
    const byAttribute: Record<ListingAttribute, number> = {
      hasPowerPlant: sums.hasPowerPlant,
      hasRegularWater: sums.hasRegularWater,
      isFurnished: sums.isFurnished,
      hasParking: sums.hasParking,
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

    // Otro `Record<…>` que es el chequeo: un filtro soltable nuevo en el
    // dominio rompe la compilación acá en vez de dejar una salida que promete
    // un número que nadie contó.
    const withoutFilter: Record<RelaxableFilter, number> = {
      zone: sums.withoutZone,
      price: sums.withoutPrice,
      rooms: sums.withoutRooms,
      bathrooms: sums.withoutBathrooms,
      publisherType: sums.withoutPublisher,
      hasPowerPlant: sums.withoutPowerPlant,
      hasRegularWater: sums.withoutRegularWater,
      isFurnished: sums.withoutFurnished,
      hasParking: sums.withoutParking,
      hasSecurity: sums.withoutSecurity,
      hasAppliances: sums.withoutAppliances,
    };

    return {
      total: sums.total,
      byZone,
      byMinRooms,
      byMinBathrooms,
      byAttribute,
      byPropertyType,
      byPublisherType,
      byPriceBucket: tallyOf(rows[0]?.priceTally),
      withoutFilter,
      cityTotal: sums.cityTotal,
      ...(widenedPrice === undefined ? {} : { withWidenedPrice: sums.widened }),
    };
  }
}

/**
 * Los ocho cubos como el dominio los pide, o los ocho ceros. **Sin filas no hay
 * arreglo que leer, y ese cero no es una aproximación**: el histograma mira un
 * subconjunto de lo que mira la consulta de afuera. Y `null` no es ausente —
 * un cubo vacío **no nombra ningún precio**, porque hay diferencia entre "no
 * hay ninguno" y "hay uno que no sé cuál es" (AGENTS.md §7).
 */
function tallyOf(cells: readonly RawBucket[] | undefined): PriceBucketTally[] {
  return BUCKET_NUMBERS.map((_, index) => {
    const cell = cells?.[index];
    if (cell === undefined) return { count: 0 };
    const [count, lowestUsd, highestUsd] = cell;
    if (count === 0 || lowestUsd === null || highestUsd === null) return { count };
    return { count, lowestUsd, highestUsd };
  });
}

/** Los dos extremos del precio como una condición, o `undefined` si no hay ninguno. */
function priceWithin(range: PriceRange): SQL | undefined {
  return and(
    range.minPriceUsd === undefined ? undefined : gte(listings.priceUsd, range.minPriceUsd),
    range.maxPriceUsd === undefined ? undefined : lte(listings.priceUsd, range.maxPriceUsd),
  );
}
