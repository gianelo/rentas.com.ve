import type { FacetCounts } from "@/modules/listing-search/application/ports/faceted-search.port";
import type { ListingSearchResult } from "@/modules/listing-search/application/ports/listing-search.port";
import type { SearchCriteria } from "@/modules/listing-search/domain/search-criteria";

/**
 * **Un catálogo de dos ciudades, para renderizar las rutas de búsqueda en el
 * servidor y leer los bytes que salen.**
 *
 * Existe para `busqueda-sin-javascript.test.tsx` y `zona-sin-javascript.test.tsx`
 * (tasks.md 11.2 a 11.6), y está afuera de los dos porque las dos pantallas
 * hacen la misma pregunta: dos copias del mismo catálogo son dos catálogos que
 * empiezan a discrepar en el próximo aviso que alguien agregue.
 *
 * **Las dos ciudades tienen avisos, y ésa es toda la razón por la que hay dos.**
 * El aislamiento del D5 —una búsqueda de Maracaibo no trae un apartamento de
 * Caracas— es la garantía sobre la que se apoya el producto entero, y su forma
 * de fallar es silenciosa: un aviso de la otra ciudad se ve como un resultado,
 * no como un error. Con una sola ciudad cargada, la prueba pasaría por no tener
 * nada que traerse de más.
 *
 * **`search` filtra de verdad, y eso NO es lo que se está probando.** Que el
 * `WHERE` filtre lo prueba `tests/integration/listing-search.test.ts` contra
 * Postgres real, que es el único lugar donde probarlo significa algo. Acá el
 * filtrado es el ESTÍMULO: hace que la pantalla que le pasara la ciudad
 * equivocada al puerto —o que dibujara el catálogo entero en vez de la
 * respuesta del puerto— traiga avisos de Distrito Capital a una zona de
 * Maracaibo. Por eso las pruebas afirman además, y sin depender de este falso,
 * con qué ciudad se llamó al puerto.
 */

interface TestCity {
  readonly id: string;
  readonly name: string;
}

export const DISTRITO: TestCity = { id: "ciudad-dc", name: "Distrito Capital" };
export const MARACAIBO: TestCity = { id: "ciudad-mcbo", name: "Maracaibo" };

/** Alfabético, como los ordena `DrizzleCatalogue.listCities`. */
export const CITIES: readonly TestCity[] = [DISTRITO, MARACAIBO];

function zone(id: string, name: string, cityId: string) {
  return { id, name, cityId, kind: "elemento" as const, category: null, parentName: null };
}

export const CHACAO = zone("zona-chacao", "Chacao", DISTRITO.id);
export const ALTAMIRA = zone("zona-altamira", "Altamira", DISTRITO.id);
export const TIERRA_NEGRA = zone("zona-tierra-negra", "Tierra Negra", MARACAIBO.id);

export const ZONES = [ALTAMIRA, CHACAO, TIERRA_NEGRA];

function listing(
  id: string,
  title: string,
  priceUsd: number,
  zoneOf: { id: string; cityId: string },
): ListingSearchResult {
  return {
    id,
    cityId: zoneOf.cityId,
    zoneId: zoneOf.id,
    title,
    priceUsd,
    rooms: 2,
    areaM2: 80,
    publisherType: "owner",
    publishedAt: new Date("2026-08-01T12:00:00Z"),
  };
}

/** Los dos de Maracaibo. Sus títulos son lo que una zona de Maracaibo debe traer. */
export const MCBO_BARATO = listing("mcbo-1", "Apartamento en Tierra Negra", 300, TIERRA_NEGRA);
export const MCBO_CARO = listing("mcbo-2", "Casa amoblada en Tierra Negra", 900, TIERRA_NEGRA);

/** Los dos de Distrito Capital. Sus títulos son lo que NO debe aparecer del otro lado. */
export const DC_CHACAO = listing("dc-1", "Estudio en Chacao", 450, CHACAO);
export const DC_ALTAMIRA = listing("dc-2", "Penthouse en Altamira", 1200, ALTAMIRA);

export const LISTINGS = [MCBO_BARATO, MCBO_CARO, DC_CHACAO, DC_ALTAMIRA];

/** Todos tienen portada: sin las dos derivadas, la regla F9 los saca de la cuadrícula. */
export function coversFor(ids: readonly string[]) {
  return new Map(
    ids.map((id) => [id, { keys: { thumb: `${id}/thumb.webp`, card: `${id}/card.webp` } }]),
  );
}

/** El mismo recorte que hace el `WHERE`, aplicado a las filas de arriba. */
export function matching(criteria: SearchCriteria): readonly ListingSearchResult[] {
  return LISTINGS.filter(
    (row) =>
      row.cityId === criteria.cityId &&
      (criteria.zoneIds === undefined || criteria.zoneIds.includes(row.zoneId)) &&
      (criteria.minPriceUsd === undefined || row.priceUsd >= criteria.minPriceUsd) &&
      (criteria.maxPriceUsd === undefined || row.priceUsd <= criteria.maxPriceUsd),
  );
}

/**
 * Conteos consistentes con `matching`, para que el número que la pantalla
 * escribe no contradiga a las tarjetas que dibuja.
 */
export function facetsFor(
  criteria: SearchCriteria,
  offeredZoneIds: readonly string[],
): FacetCounts {
  const rows = matching(criteria);
  // Las mismas filas con el precio apagado: es contra ellas que se reparte el
  // histograma, y de ellas salen los extremos reales del mercado.
  const { minPriceUsd: _min, maxPriceUsd: _max, ...withoutPrice } = criteria;
  const unpriced = matching(withoutPrice);
  const cityTotal = LISTINGS.filter((row) => row.cityId === criteria.cityId).length;
  const byZone: Record<string, number> = {};
  for (const id of offeredZoneIds) byZone[id] = 0;
  for (const row of rows) byZone[row.zoneId] = (byZone[row.zoneId] ?? 0) + 1;

  return {
    total: rows.length,
    byZone,
    byMinRooms: { 1: rows.length, 2: rows.length, 3: 0, 4: 0 },
    // Los cuatro avisos falsos tienen dos baños, igual que tienen dos
    // habitaciones: los conteos salen de `rows` y no de un número escrito a
    // mano, que es la regla que este archivo se puso arriba.
    byMinBathrooms: { 1: rows.length, 2: rows.length, 3: 0 },
    byAttribute: {
      hasPowerPlant: 0,
      hasRegularWater: 0,
      isFurnished: 0,
      hasSecurity: 0,
      hasAppliances: 0,
    },
    byPropertyType: { apartamento: rows.length, casa: 0, quinta: 0, anexo: 0, habitacion: 0 },
    byPublisherType: { owner: rows.length, broker: 0 },
    // Un cubo con todo adentro, rotulado con precios reales: es una
    // repartición válida y ninguna de las dos pantallas que leen este catálogo
    // dibuja todavía una barra. Repartir de verdad sería meter la regla del
    // histograma en `app/`, donde no vive.
    //
    // **Se cuenta SIN el filtro de precio**, como el adaptador real (14.12
    // rebanada B, decisión (a)): es esa propiedad la que deja saber cuánto
    // cuesta el más caro cuando el mínimo pedido no lo alcanza (14.13).
    byPriceBucket: [
      ...(unpriced.length === 0
        ? [{ count: 0 }]
        : [
            {
              count: unpriced.length,
              lowestUsd: Math.min(...unpriced.map((row) => row.priceUsd)),
              highestUsd: Math.max(...unpriced.map((row) => row.priceUsd)),
            },
          ]),
      ...Array.from({ length: 7 }, () => ({ count: 0 })),
    ],
    withoutFilter: {
      zone: cityTotal,
      price: cityTotal,
      rooms: rows.length,
      bathrooms: rows.length,
      publisherType: rows.length,
      hasPowerPlant: rows.length,
      hasRegularWater: rows.length,
      isFurnished: rows.length,
      hasSecurity: rows.length,
      hasAppliances: rows.length,
    },
    cityTotal,
  };
}
