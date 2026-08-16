import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CityZoneSelect } from "./CityZoneSelect";

const cities = [
  { id: "dc", name: "Distrito Capital" },
  { id: "mcbo", name: "Maracaibo" },
];

const zones = [
  { id: "chacao", name: "Chacao", cityId: "dc" },
  { id: "altamira", name: "Altamira", cityId: "dc" },
  { id: "tierra-negra", name: "Tierra Negra", cityId: "mcbo" },
  { id: "la-lago", name: "La Lago", cityId: "mcbo" },
];

// tasks.md 2.4 — the zone selector offers only the selected city's zones.
// The filter lives inside the component (design.md D5's "guarantees live
// in the narrowest API"): a caller passing every zone plus a
// selectedCityId must not be able to leak the wrong city's zones by
// forgetting to filter, because there is nothing left for it to filter.
describe("CityZoneSelect", () => {
  it("offers only the selected city's zones", () => {
    const markup = renderToStaticMarkup(
      <CityZoneSelect cities={cities} zones={zones} selectedCityId="mcbo" />,
    );

    expect(markup).toContain("Tierra Negra");
    expect(markup).toContain("La Lago");
    expect(markup).not.toContain("Chacao");
    expect(markup).not.toContain("Altamira");
  });

  it("switches the offered zones when the selected city switches", () => {
    const markup = renderToStaticMarkup(
      <CityZoneSelect cities={cities} zones={zones} selectedCityId="dc" />,
    );

    expect(markup).toContain("Chacao");
    expect(markup).toContain("Altamira");
    expect(markup).not.toContain("Tierra Negra");
    expect(markup).not.toContain("La Lago");
  });

  it("offers no zone options when no city is selected yet", () => {
    const markup = renderToStaticMarkup(<CityZoneSelect cities={cities} zones={zones} />);

    expect(markup).not.toContain("Chacao");
    expect(markup).not.toContain("Tierra Negra");
  });
});
