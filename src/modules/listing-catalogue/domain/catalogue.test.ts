import { describe, expect, it } from "vitest";
import {
  type CatalogueCity,
  type CatalogueZone,
  resolveSelectedCity,
  zonesForCity,
} from "./catalogue";

const CARACAS: CatalogueCity = { id: "city-dc", name: "Distrito Capital" };
const MARACAIBO: CatalogueCity = { id: "city-mcbo", name: "Maracaibo" };
const CITIES: readonly CatalogueCity[] = [CARACAS, MARACAIBO];

const ZONES: readonly CatalogueZone[] = [
  { id: "zone-chacao", name: "Chacao", cityId: CARACAS.id },
  { id: "zone-lag", name: "La Lago", cityId: MARACAIBO.id },
  { id: "zone-lpg", name: "Los Palos Grandes", cityId: CARACAS.id },
];

describe("resolveSelectedCity", () => {
  it("keeps the city the visitor asked for", () => {
    expect(resolveSelectedCity(CITIES, MARACAIBO.id)).toBe(MARACAIBO.id);
  });

  /**
   * **The rule that was living in `app/page.tsx`.** Which city someone sees
   * before choosing one is a product decision, and it was being made by an
   * `ORDER BY name` — an accident, not a decision. It is stated here so it is
   * one place, provable, and changeable without touching a page.
   */
  it("falls back to the catalogue's first city when the visitor named none", () => {
    expect(resolveSelectedCity(CITIES, undefined)).toBe(CARACAS.id);
    expect(resolveSelectedCity(CITIES, "")).toBe(CARACAS.id);
    expect(resolveSelectedCity(CITIES, "   ")).toBe(CARACAS.id);
  });

  /**
   * **The load-bearing case.** `buildSearchCriteria` puts this value straight
   * into `WHERE city_id = $1` without checking it exists, so an unknown id
   * used to produce an empty page for a catalogue full of listings — and the
   * visitor had no way to tell that from "no hay avisos". A city that is not
   * curated is not a city; the answer is the default, not the garbage.
   */
  it("refuses a city the catalogue does not hold and falls back", () => {
    for (const forged of [
      "city-valencia",
      "'; drop table listing; --",
      "../../etc/passwd",
      CARACAS.id.toUpperCase(),
    ]) {
      expect(resolveSelectedCity(CITIES, forged)).toBe(CARACAS.id);
    }
  });

  /**
   * `null`, never a made-up id. An empty catalogue means the product has not
   * launched anywhere, and the page has to say so — inventing a city id here
   * would push a query that cannot match into the database instead.
   */
  it("returns null when the catalogue is empty", () => {
    expect(resolveSelectedCity([], undefined)).toBeNull();
    expect(resolveSelectedCity([], "city-dc")).toBeNull();
  });
});

describe("zonesForCity", () => {
  it("returns only the zones belonging to that city", () => {
    expect(zonesForCity(ZONES, CARACAS.id).map((zone) => zone.id)).toEqual([
      "zone-chacao",
      "zone-lpg",
    ]);
    expect(zonesForCity(ZONES, MARACAIBO.id).map((zone) => zone.id)).toEqual(["zone-lag"]);
  });

  /**
   * **This is D5 on the read path.** The zone selector used to render every
   * curated zone at once, grouped by city, so choosing Maracaibo still showed
   * Chacao. Filtering in the domain rather than in the component is what the
   * founder's standing rule asks for (2026-08-21) — and it is also the only
   * version a test can hold.
   */
  it("never leaks another city's zones", () => {
    const forCaracas = zonesForCity(ZONES, CARACAS.id);

    expect(forCaracas.every((zone) => zone.cityId === CARACAS.id)).toBe(true);
    expect(forCaracas).not.toContainEqual(expect.objectContaining({ cityId: MARACAIBO.id }));
  });

  it("returns nothing for an unknown or absent city rather than everything", () => {
    // The dangerous failure mode is the opposite one: a filter that gives up
    // and returns the whole taxonomy puts both cities back in the control.
    expect(zonesForCity(ZONES, "city-valencia")).toEqual([]);
    expect(zonesForCity(ZONES, null)).toEqual([]);
  });
});
