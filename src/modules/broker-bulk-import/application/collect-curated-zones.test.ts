import { describe, expect, it, vi } from "vitest";
import type { ZoneCataloguePort } from "../../listing-publication/application/ports/zone-catalogue.port";
import type { ImportRow } from "../domain/csv-import-rows";
import { collectCuratedZonesForRows } from "./collect-curated-zones";

/**
 * `ZoneCataloguePort.listZonesForCity` is scoped to one city (see its own
 * doc comment). A bulk-import file can legitimately mix rows across several
 * cities, so `validateImportRows` needs the UNION of curated zones for
 * every city actually present — this is the one place that union is built.
 */
function rowFor(city: string): ImportRow {
  return { city };
}

describe("collectCuratedZonesForRows", () => {
  it("calls listZonesForCity ONCE per distinct city in the rows", async () => {
    const listZonesForCity = vi.fn(async (cityId: string) => [{ id: `zone-${cityId}`, cityId }]);
    const zones: ZoneCataloguePort = { listZonesForCity };

    const result = await collectCuratedZonesForRows(
      [rowFor("distrito-capital"), rowFor("maracaibo"), rowFor("distrito-capital")],
      zones,
    );

    expect(listZonesForCity).toHaveBeenCalledTimes(2);
    expect(listZonesForCity).toHaveBeenCalledWith("distrito-capital");
    expect(listZonesForCity).toHaveBeenCalledWith("maracaibo");
    expect(result).toEqual(
      expect.arrayContaining([
        { id: "zone-distrito-capital", cityId: "distrito-capital" },
        { id: "zone-maracaibo", cityId: "maracaibo" },
      ]),
    );
  });

  it("skips a row with no city value, rather than querying an empty string", async () => {
    const listZonesForCity = vi.fn(async () => []);
    const zones: ZoneCataloguePort = { listZonesForCity };

    await collectCuratedZonesForRows([rowFor("")], zones);

    expect(listZonesForCity).not.toHaveBeenCalled();
  });

  it("returns an empty list for an empty set of rows", async () => {
    const listZonesForCity = vi.fn(async () => []);
    const zones: ZoneCataloguePort = { listZonesForCity };

    const result = await collectCuratedZonesForRows([], zones);

    expect(result).toEqual([]);
    expect(listZonesForCity).not.toHaveBeenCalled();
  });
});
