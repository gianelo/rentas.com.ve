import type { PriceBucketTally } from "../application/ports/faceted-search.port";
import type { ZonePriceTallyPort } from "../application/ports/zone-price-tally.port";
import { DrizzleFacetedSearch, type FacetedSearchDatabase } from "./drizzle-faceted-search";

/**
 * **Los ocho cubos de una zona, del mismo motor que la lista** (tasks.md 18.9).
 *
 * No escribe una línea de SQL, y eso es el adaptador entero: compone
 * `DrizzleFacetedSearch` y devuelve la única faceta que el paso 3 mira. **Dos
 * `width_bucket` serían dos reparticiones para la misma zona y, tarde o
 * temprano, dos «la mayoría pide entre» distintos.** `offeredZoneIds` va vacío
 * porque publicar no ofrece ninguna zona que contar, y el criterio no lleva
 * precio a propósito (ver el puerto).
 */
export class DrizzleZonePriceTally implements ZonePriceTallyPort {
  constructor(private readonly db: FacetedSearchDatabase) {}

  async tallyForZone(cityId: string, zoneId: string): Promise<readonly PriceBucketTally[]> {
    const counts = await new DrizzleFacetedSearch(this.db).countFacets(
      { cityId, zoneIds: [zoneId] },
      [],
    );
    return counts.byPriceBucket;
  }
}
