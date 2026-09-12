import { and, eq, exists, gt, gte, inArray, lte, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import type { PropertyType } from "../../../shared/db/schema";
import { listingPhotoDerivatives, listingPhotos, listings } from "../../../shared/db/schema";
import { REQUIRED_SIZES } from "../../listing-discovery/domain/listing-grid";
import { assertRowBudget } from "../../operability/domain/row-budget";
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
type FacetAxis =
  | "zone"
  | "rooms"
  | "bathrooms"
  | "type"
  | "publisher"
  | "price"
  | "area"
  | ListingAttribute;

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
    // criterio y el estado no está en el criterio en absoluto (5.5/5.6).
    //
    // **El área salió de acá con la 14.45 rebanada B**, por la misma razón por
    // la que el precio había salido con F10/F11: desde el `WHERE` compartido un
    // filtro no puede decir cuántos habría sin él, y encima se colaba en
    // `cityTotal` — el número de «Limpiar todo» prometía la ciudad **ya
    // recortada por los metros²**. Que no tenga faceta propia no lo saca del
    // juego: no hay opciones que contar, pero sí una relajación que ofrecer.
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
    //
    // **La cuarta condición incondicional, y es la que la 28.3 agrega.**
    // `buildListingGrid` (F9, `listing-grid.ts`) descarta en JavaScript todo
    // aviso sin las dos derivadas requeridas de su portada — «un aviso sin
    // portada no se muestra» — y hasta acá ese descarte ocurría DESPUÉS de que
    // este archivo ya lo hubiera contado: el mismo defecto de forma que la
    // 27.1 y la 27.8 ya corrigieron para la taxonomía y las zonas, ahora en la
    // fotografía. La importación de cartera de la Fase 9 no exige foto al
    // importar (`broker-bulk-import`) y `activateListing` sí la exige antes de
    // marcar `active` — así que en el camino real un aviso activo siempre
    // tiene AL MENOS una foto —, pero el rellenado de derivadas de la 19a
    // puede dejar una portada a medio derivar, incompleta en `thumb` o `card`
    // y por lo tanto invisible en la cuadrícula aunque `status` diga `active`.
    // `hasDrawableCover` repite la MISMA pregunta que F9 ya resuelve en
    // JavaScript, con la MISMA lista de tamaños (`REQUIRED_SIZES`,
    // importada y no copiada), para que el número que este archivo promete
    // sea el número que `buildListingGrid` puede dibujar de verdad.
    const hasDrawableCover = exists(
      this.db
        .select({ photoId: listingPhotos.id })
        .from(listingPhotos)
        .innerJoin(listingPhotoDerivatives, eq(listingPhotoDerivatives.photoId, listingPhotos.id))
        .where(
          and(
            eq(listingPhotos.listingId, listings.id),
            eq(listingPhotos.position, 0),
            inArray(listingPhotoDerivatives.name, [...REQUIRED_SIZES]),
          ),
        )
        .groupBy(listingPhotos.id)
        .having(sql`count(*) = ${REQUIRED_SIZES.length}`),
    );

    const shared = [
      eq(listings.cityId, criteria.cityId),
      eq(listings.status, "active"),
      gt(listings.expiresAt, sql`now()`),
      hasDrawableCover,
    ];

    // El precio se salió del `WHERE` compartido: es soltable, y un filtro que
    // vive afuera no puede contar cuántos habría sin él.
    const priceFilter = priceWithin(criteria);
    // La superficie mínima, por el mismo motivo y con la misma forma.
    const areaFilter =
      criteria.minAreaM2 === undefined ? undefined : gte(listings.areaM2, criteria.minAreaM2);

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
      except === "area" ? undefined : areaFilter,
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

    /**
     * **La ciudad entera, en UNA fila y sin agrupar por zona** (task 27.8).
     *
     * `total`, `cityTotal`, las seis facetas de atributo/tipo/publicador, las
     * nueve relajaciones y el escalón siguiente de precio no son preguntas
     * sobre las zonas ofrecidas: son preguntas sobre la ciudad, y agruparlas
     * por zona —como hacía este archivo antes de la 27.8— sólo repetía el
     * mismo número treinta columnas de ancho en cada fila, una vez por cada
     * zona de la ciudad CON avisos. Acá se agregan una única vez, sin
     * `GROUP BY`, así que Postgres devuelve exactamente una fila sin
     * importar cuántas zonas tenga la ciudad detrás.
     */
    const citywide = this.db
      .select({
        // El total lleva todos: es la búsqueda entera, la que el botón dice.
        // El `.as(…)` en cada columna es lo que deja referenciarla después
        // como `citywide.total`: una expresión SQL cruda que sólo tiene
        // nombre de propiedad en TypeScript sigue sin nombre para Postgres.
        total: countWhere(...others()).as("total"),
        // Las de habitaciones ignoran `minRooms` y respetan el resto. El 4 es
        // "4 o más", igual que el criterio, porque es el mismo filtro.
        rooms1: countWhere(...others("rooms"), gte(listings.rooms, 1)).as("rooms1"),
        rooms2: countWhere(...others("rooms"), gte(listings.rooms, 2)).as("rooms2"),
        rooms3: countWhere(...others("rooms"), gte(listings.rooms, 3)).as("rooms3"),
        rooms4: countWhere(...others("rooms"), gte(listings.rooms, 4)).as("rooms4"),
        // El `>=` es la mitad que decide: el escalón «3+» significa tres
        // baños o más, igual que el criterio, porque es el mismo filtro.
        bathrooms1: countWhere(...others("bathrooms"), gte(listings.bathrooms, 1)).as("bathrooms1"),
        bathrooms2: countWhere(...others("bathrooms"), gte(listings.bathrooms, 2)).as("bathrooms2"),
        bathrooms3: countWhere(...others("bathrooms"), gte(listings.bathrooms, 3)).as("bathrooms3"),
        hasPowerPlant: countWhere(...others("hasPowerPlant"), eq(listings.hasPowerPlant, true)).as(
          "hasPowerPlant",
        ),
        hasRegularWater: countWhere(
          ...others("hasRegularWater"),
          eq(listings.hasRegularWater, true),
        ).as("hasRegularWater"),
        isFurnished: countWhere(...others("isFurnished"), eq(listings.isFurnished, true)).as(
          "isFurnished",
        ),
        // Derivada de `parking_spots > 0`, no de un booleano (14.45 rebanada
        // C), y con su propio filtro apagado, que es lo que deja que su
        // número diga cuántos habría si se cambiara.
        hasParking: countWhere(...others("hasParking"), attributeCondition("hasParking")).as(
          "hasParking",
        ),
        hasSecurity: countWhere(...others("hasSecurity"), eq(listings.hasSecurity, true)).as(
          "hasSecurity",
        ),
        hasAppliances: countWhere(...others("hasAppliances"), eq(listings.hasAppliances, true)).as(
          "hasAppliances",
        ),
        apartamento: countWhere(...others("type"), eq(listings.propertyType, "apartamento")).as(
          "apartamento",
        ),
        casa: countWhere(...others("type"), eq(listings.propertyType, "casa")).as("casa"),
        quinta: countWhere(...others("type"), eq(listings.propertyType, "quinta")).as("quinta"),
        anexo: countWhere(...others("type"), eq(listings.propertyType, "anexo")).as("anexo"),
        habitacion: countWhere(...others("type"), eq(listings.propertyType, "habitacion")).as(
          "habitacion",
        ),
        owner: countWhere(...others("publisher"), eq(listings.publisherType, "owner")).as("owner"),
        broker: countWhere(...others("publisher"), eq(listings.publisherType, "broker")).as(
          "broker",
        ),
        // Las nueve relajaciones, más el techo siguiente y la ciudad pelada.
        withoutZone: without("zone").as("withoutZone"),
        withoutPrice: without("price").as("withoutPrice"),
        // **Sin faceta pero con relajación** (14.45 rebanada B): un campo
        // libre no tiene opciones que contar, y «cuántos habría sin los
        // metros²» es un número como cualquier otro.
        withoutArea: without("area").as("withoutArea"),
        withoutRooms: without("rooms").as("withoutRooms"),
        withoutBathrooms: without("bathrooms").as("withoutBathrooms"),
        withoutPublisher: without("publisher").as("withoutPublisher"),
        withoutPowerPlant: without("hasPowerPlant").as("withoutPowerPlant"),
        withoutRegularWater: without("hasRegularWater").as("withoutRegularWater"),
        withoutFurnished: without("isFurnished").as("withoutFurnished"),
        withoutParking: without("hasParking").as("withoutParking"),
        withoutSecurity: without("hasSecurity").as("withoutSecurity"),
        withoutAppliances: without("hasAppliances").as("withoutAppliances"),
        // El precio ampliado un escalón: el resto de los filtros siguen. Sin
        // pedido, repite el total y nadie lo lee — la respuesta se omite.
        widened: countWhere(...others("price"), priceWithin(widenedPrice ?? criteria)).as(
          "widened",
        ),
        // La ciudad sin un solo filtro del panel: el número de «Limpiar todo».
        cityTotal: countWhere().as("cityTotal"),
      })
      .from(listings)
      .where(and(...shared))
      .as("citywide");

    /**
     * **Sólo las zonas ofrecidas, y acá SÍ es donde el `WHERE` acota** (task
     * 27.8, decisión del fundador 2026-09-08: «los límites tienen que ser con
     * base de datos, no en el lado del server»). Antes esta agrupación corría
     * sobre TODA zona de la ciudad con al menos un aviso —sin techo, y
     * Caracas tiene 3.220 zonas—; ahora el `WHERE` la acota a
     * `offeredZoneIds`, que son las zonas que el panel efectivamente va a
     * dibujar. Cada fila queda angosta a propósito: dos columnas, no las
     * treinta y pico que antes cargaba cada grupo.
     */
    const zoneAgg = this.db
      .select({
        zoneId: listings.zoneId,
        // La faceta de zona ignora la zona elegida y respeta todo lo demás.
        inZone: countWhere(...others("zone")).as("inZone"),
        // **Sólo para decidir si esta zona se ofrece**, no para ofrecerla con
        // un número: una zona entra en `byZone` cuando tiene algún aviso
        // dentro del precio y el área.
        withinPrice: countWhere(priceFilter, areaFilter).as("withinPrice"),
      })
      .from(listings)
      .where(and(...shared, inArray(listings.zoneId, [...offeredZoneIds])))
      .groupBy(listings.zoneId)
      .as("zoneAgg");

    // `citywide` y `priceFacet` agregan sin `GROUP BY`, así que las dos
    // devuelven SIEMPRE una fila —incluso sobre cero avisos que combinen—, y
    // el `CROSS JOIN` entre las dos nunca pierde esa fila. `zoneAgg` puede
    // devolver cero filas (ninguna zona ofrecida tiene avisos), así que va
    // por `LEFT JOIN`: perderla borraría la ciudad entera del resultado.
    const rows = await this.db
      .select({
        total: citywide.total,
        rooms1: citywide.rooms1,
        rooms2: citywide.rooms2,
        rooms3: citywide.rooms3,
        rooms4: citywide.rooms4,
        bathrooms1: citywide.bathrooms1,
        bathrooms2: citywide.bathrooms2,
        bathrooms3: citywide.bathrooms3,
        hasPowerPlant: citywide.hasPowerPlant,
        hasRegularWater: citywide.hasRegularWater,
        isFurnished: citywide.isFurnished,
        hasParking: citywide.hasParking,
        hasSecurity: citywide.hasSecurity,
        hasAppliances: citywide.hasAppliances,
        apartamento: citywide.apartamento,
        casa: citywide.casa,
        quinta: citywide.quinta,
        anexo: citywide.anexo,
        habitacion: citywide.habitacion,
        owner: citywide.owner,
        broker: citywide.broker,
        withoutZone: citywide.withoutZone,
        withoutPrice: citywide.withoutPrice,
        withoutArea: citywide.withoutArea,
        withoutRooms: citywide.withoutRooms,
        withoutBathrooms: citywide.withoutBathrooms,
        withoutPublisher: citywide.withoutPublisher,
        withoutPowerPlant: citywide.withoutPowerPlant,
        withoutRegularWater: citywide.withoutRegularWater,
        withoutFurnished: citywide.withoutFurnished,
        withoutParking: citywide.withoutParking,
        withoutSecurity: citywide.withoutSecurity,
        withoutAppliances: citywide.withoutAppliances,
        widened: citywide.widened,
        cityTotal: citywide.cityTotal,
        // Los ocho cubos, iguales en cada fila porque se agregaron aparte
        // (14.12) y nunca dependen de la zona.
        priceTally: priceFacet.tally,
        zoneId: zoneAgg.zoneId,
        inZone: zoneAgg.inZone,
        withinPrice: zoneAgg.withinPrice,
      })
      .from(citywide)
      .innerJoin(priceFacet, sql`true`)
      .leftJoin(zoneAgg, sql`true`);

    assertRowBudget(rows, "DrizzleFacetedSearch.countFacets");

    // `citywide` siempre trae exactamente una fila (un agregado sin
    // `GROUP BY` la devuelve aun sobre cero avisos), así que `rows` nunca
    // llega vacío: en el peor caso es la fila de la ciudad sola, con las
    // columnas de `zoneAgg` en `null` porque ninguna zona ofrecida calificó.
    const first = rows[0];
    if (first === undefined) {
      throw new Error(
        "DrizzleFacetedSearch.countFacets: la fila de la ciudad no llegó — " +
          "un agregado sin GROUP BY siempre debería devolver una.",
      );
    }

    // Cada zona ofrecida arranca en cero y se queda en cero si no tiene fila.
    // Es la regla 4 ("ninguna opción lleva a un vacío") hecha dato: la clave
    // ausente le impediría a la pantalla distinguir "no hay" de "no pregunté".
    const byZone: Record<string, number> = {};
    for (const zoneId of offeredZoneIds) byZone[zoneId] = 0;

    for (const row of rows) {
      // La zona se ofrece si tiene algo dentro del precio — con cero avisos
      // dentro nunca fue una opción, y ahora que el precio salió del `WHERE`
      // su fila igual llega. Las ofrecidas ya están puestas en cero arriba.
      if (row.zoneId !== null && (row.withinPrice ?? 0) > 0) {
        byZone[row.zoneId] = row.inZone ?? 0;
      }
    }

    // Las anotaciones `Record<…>` de abajo son el chequeo: un sexto tipo de
    // propiedad o un sexto atributo en el esquema rompe la compilación acá, en
    // vez de dejar viva una faceta que nunca lo cuenta.
    const byMinRooms: Record<RoomStep, number> = {
      1: first.rooms1,
      2: first.rooms2,
      3: first.rooms3,
      4: first.rooms4,
    };
    // Mismo chequeo que el de abajo: un cuarto escalón de baños en el dominio
    // rompe la compilación acá en vez de dejar un botón que nadie cuenta.
    const byMinBathrooms: Record<BathroomStep, number> = {
      1: first.bathrooms1,
      2: first.bathrooms2,
      3: first.bathrooms3,
    };
    const byAttribute: Record<ListingAttribute, number> = {
      hasPowerPlant: first.hasPowerPlant,
      hasRegularWater: first.hasRegularWater,
      isFurnished: first.isFurnished,
      hasParking: first.hasParking,
      hasSecurity: first.hasSecurity,
      hasAppliances: first.hasAppliances,
    };
    const byPropertyType: Record<PropertyType, number> = {
      apartamento: first.apartamento,
      casa: first.casa,
      quinta: first.quinta,
      anexo: first.anexo,
      habitacion: first.habitacion,
    };
    const byPublisherType: Record<PublisherType, number> = {
      owner: first.owner,
      broker: first.broker,
    };

    // Otro `Record<…>` que es el chequeo: un filtro soltable nuevo en el
    // dominio rompe la compilación acá en vez de dejar una salida que promete
    // un número que nadie contó.
    const withoutFilter: Record<RelaxableFilter, number> = {
      zone: first.withoutZone,
      price: first.withoutPrice,
      area: first.withoutArea,
      rooms: first.withoutRooms,
      bathrooms: first.withoutBathrooms,
      publisherType: first.withoutPublisher,
      hasPowerPlant: first.withoutPowerPlant,
      hasRegularWater: first.withoutRegularWater,
      isFurnished: first.withoutFurnished,
      hasParking: first.withoutParking,
      hasSecurity: first.withoutSecurity,
      hasAppliances: first.withoutAppliances,
    };

    return {
      total: first.total,
      byZone,
      byMinRooms,
      byMinBathrooms,
      byAttribute,
      byPropertyType,
      byPublisherType,
      byPriceBucket: tallyOf(first.priceTally),
      withoutFilter,
      cityTotal: first.cityTotal,
      ...(widenedPrice === undefined ? {} : { withWidenedPrice: first.widened }),
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
