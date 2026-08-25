import type { ZoneCataloguePort } from "../../listing-publication/application/ports/zone-catalogue.port";
import type { CuratedZone } from "../../listing-publication/domain/publishable-listing";
import type { ImportRow } from "../domain/csv-import-rows";

/**
 * `ZoneCataloguePort.listZonesForCity` is scoped to one city — by design,
 * per its own doc comment. `validateImportRows` validates the WHOLE file
 * against one flat `curatedZones` list, the same shape
 * `validatePublishableListing` already takes for a single listing — so this
 * function builds the union of every distinct city actually present across
 * the file's rows, calling the port once per city rather than once per row.
 */
export async function collectCuratedZonesForRows(
  rows: readonly ImportRow[],
  zones: ZoneCataloguePort,
): Promise<readonly CuratedZone[]> {
  const cityIds = new Set<string>();
  for (const row of rows) {
    const cityId = row.city;
    if (cityId) cityIds.add(cityId);
  }

  const perCity = await Promise.all([...cityIds].map((cityId) => zones.listZonesForCity(cityId)));

  return perCity.flat();
}
