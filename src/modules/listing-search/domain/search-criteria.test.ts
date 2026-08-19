import { describe, expect, it } from "vitest";
import { buildSearchCriteria, type CuratedZone } from "./search-criteria";

const MARACAIBO = "city-maracaibo";
const DISTRITO = "city-distrito";

/** Both cities have a zone called "Centro"; only the ids differ. */
const ZONES: readonly CuratedZone[] = [
  { id: "zone-mcbo-centro", cityId: MARACAIBO },
  { id: "zone-mcbo-norte", cityId: MARACAIBO },
  { id: "zone-dc-centro", cityId: DISTRITO },
];

describe("buildSearchCriteria — city scope (task 5.1, design.md D5)", () => {
  it("refuses to produce criteria without a city", () => {
    expect(buildSearchCriteria({ city: undefined }, ZONES)).toBeNull();
    expect(buildSearchCriteria({ city: null }, ZONES)).toBeNull();
    expect(buildSearchCriteria({ city: "" }, ZONES)).toBeNull();
    expect(buildSearchCriteria({ city: "   " }, ZONES)).toBeNull();
  });

  it("carries the submitted city through as the required scope", () => {
    expect(buildSearchCriteria({ city: MARACAIBO }, ZONES)).toEqual({ cityId: MARACAIBO });
  });
});

describe("buildSearchCriteria — stale zone (task 5.0)", () => {
  it("keeps a zone that belongs to the submitted city", () => {
    const criteria = buildSearchCriteria({ city: MARACAIBO, zone: "zone-mcbo-centro" }, ZONES);

    expect(criteria).toEqual({ cityId: MARACAIBO, zoneId: "zone-mcbo-centro" });
  });

  it("ignores the previous city's zone rather than searching for it", () => {
    // The exact pair the GET form sends when someone switches city without
    // touching the zone select (components/molecules/CityZoneSelect.tsx).
    // Dropping the zone means "all of Maracaibo", which is what the visitor
    // just asked for; keeping it would mean an empty result page for a city
    // that has listings, and the visitor has no way to tell why.
    const criteria = buildSearchCriteria({ city: MARACAIBO, zone: "zone-dc-centro" }, ZONES);

    expect(criteria).toEqual({ cityId: MARACAIBO });
  });

  it("ignores a zone id that is not in the curated taxonomy at all", () => {
    // A hand-edited URL. Same rule, same reason.
    expect(buildSearchCriteria({ city: MARACAIBO, zone: "made-up" }, ZONES)).toEqual({
      cityId: MARACAIBO,
    });
  });

  it("checks membership against the submitted city, not against the caller's list", () => {
    // Handed EVERY curated zone including the other city's, the builder must
    // still refuse the mismatched one. A pre-filtered list would make this
    // guarantee the caller's to keep, and D5 puts it in the narrowest API.
    expect(buildSearchCriteria({ city: DISTRITO, zone: "zone-mcbo-norte" }, ZONES)).toEqual({
      cityId: DISTRITO,
    });
  });
});

describe("buildSearchCriteria — price and characteristics", () => {
  it("reads the numeric filters a query string carries as text", () => {
    const criteria = buildSearchCriteria(
      { city: MARACAIBO, minPrice: "200", maxPrice: "500", minRooms: "2", minAreaM2: "60" },
      ZONES,
    );

    expect(criteria).toEqual({
      cityId: MARACAIBO,
      minPriceUsd: 200,
      maxPriceUsd: 500,
      minRooms: 2,
      minAreaM2: 60,
    });
  });

  it("drops values that are not whole non-negative numbers", () => {
    const criteria = buildSearchCriteria(
      { city: MARACAIBO, minPrice: "abc", maxPrice: "-1", minRooms: "1.5", minAreaM2: "" },
      ZONES,
    );

    expect(criteria).toEqual({ cityId: MARACAIBO });
  });

  it("keeps an inverted price range instead of silently widening it", () => {
    // Unlike the stale zone, an inverted range is what the visitor typed and
    // can see in the two inputs. "Nothing costs between 900 and 200" is a
    // true answer; quietly swapping the bounds would answer a question
    // nobody asked.
    expect(
      buildSearchCriteria({ city: MARACAIBO, minPrice: "900", maxPrice: "200" }, ZONES),
    ).toEqual({ cityId: MARACAIBO, minPriceUsd: 900, maxPriceUsd: 200 });
  });
});
