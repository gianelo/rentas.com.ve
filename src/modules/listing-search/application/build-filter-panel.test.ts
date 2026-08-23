import { describe, expect, it } from "vitest";
import type { SearchCriteria } from "../domain/search-criteria";
import { buildFilterPanel } from "./build-filter-panel";
import type { FacetCounts, FacetedSearchPort, PriceRange } from "./ports/faceted-search.port";

const EMPTY: FacetCounts = {
  total: 0,
  byZone: {},
  byMinRooms: { 1: 0, 2: 0, 3: 0, 4: 0 },
  byAttribute: {
    hasPowerPlant: 0,
    hasRegularWater: 0,
    isFurnished: 0,
    hasSecurity: 0,
    hasAppliances: 0,
  },
  byPropertyType: { apartamento: 0, casa: 0, quinta: 0, anexo: 0, habitacion: 0 },
  byPublisherType: { owner: 0, broker: 0 },
  withoutFilter: {
    zone: 0,
    price: 0,
    rooms: 0,
    publisherType: 0,
    hasPowerPlant: 0,
    hasRegularWater: 0,
    isFurnished: 0,
    hasSecurity: 0,
    hasAppliances: 0,
  },
  cityTotal: 0,
};

/**
 * Un puerto falso que **registra cada llamada**. Lo que se prueba acá no es que
 * los números salgan bien —eso lo prueba el adaptador contra Postgres real—
 * sino a QUIÉN se le pregunta qué: que el conteo de cada ciudad sea el de esa
 * ciudad, y que no se pida un conteo por un filtro que nadie puso.
 */
function fakeFacets(byCity: Readonly<Record<string, Partial<FacetCounts>>>) {
  const calls: {
    criteria: SearchCriteria;
    offeredZoneIds: readonly string[];
    widenedPrice?: PriceRange;
  }[] = [];

  const port: FacetedSearchPort = {
    async countFacets(criteria, offeredZoneIds, widenedPrice) {
      calls.push({
        criteria,
        offeredZoneIds,
        ...(widenedPrice === undefined ? {} : { widenedPrice }),
      });
      return { ...EMPTY, ...byCity[criteria.cityId] };
    },
  };

  return { port, calls };
}

const PLACE = {
  basePath: "/alquiler/distrito-capital",
  cityPath: "/alquiler/distrito-capital",
  cityId: "dc",
  cities: [
    { id: "dc", name: "Distrito Capital", path: "/alquiler/distrito-capital" },
    { id: "mcbo", name: "Maracaibo", path: "/alquiler/maracaibo" },
  ],
  zones: [
    { id: "chacao", name: "Chacao", path: "/alquiler/distrito-capital/chacao" },
    { id: "altamira", name: "Altamira", path: "/alquiler/distrito-capital/altamira" },
    { id: "rosal", name: "El Rosal", path: "/alquiler/distrito-capital/el-rosal" },
  ],
};

describe("buildFilterPanel", () => {
  it("pregunta el conteo de cada ciudad por separado (F3)", async () => {
    const { port, calls } = fakeFacets({
      dc: { total: 47, byZone: { chacao: 12 } },
      mcbo: { total: 23 },
    });

    const { panel } = await buildFilterPanel(port, {
      ...PLACE,
      query: {},
      chosenZoneIds: [],
      criteria: { cityId: "dc" },
    });

    expect(panel.cities.map((city) => city.count)).toEqual([47, 23]);
    expect(calls.map((call) => call.criteria.cityId).sort()).toEqual(["dc", "mcbo"]);
  });

  it("el conteo de la otra ciudad no arrastra las zonas de ésta", async () => {
    // Una zona de Caracas dentro de un conteo de Maracaibo da cero, y el
    // visitante vería «Maracaibo 0» sobre una ciudad llena de avisos.
    const { port, calls } = fakeFacets({ dc: { total: 9 }, mcbo: { total: 23 } });

    await buildFilterPanel(port, {
      ...PLACE,
      query: {},
      chosenZoneIds: ["chacao"],
      criteria: { cityId: "dc", zoneIds: ["chacao"] },
    });

    const other = calls.find((call) => call.criteria.cityId === "mcbo");

    expect(other?.criteria.zoneIds).toBeUndefined();
  });

  it("ofrece las zonas que el conteo devolvió, en el orden del catálogo", async () => {
    const { port } = fakeFacets({
      dc: { total: 16, byZone: { rosal: 0, altamira: 9, chacao: 12 } },
      mcbo: {},
    });

    const { panel } = await buildFilterPanel(port, {
      ...PLACE,
      query: {},
      chosenZoneIds: [],
      criteria: { cityId: "dc" },
    });

    expect(panel.zones.map((zone) => zone.id)).toEqual(["chacao", "altamira", "rosal"]);
  });

  it("no ofrece una zona que el catálogo de esta ciudad no tiene", async () => {
    const { port } = fakeFacets({
      dc: { total: 16, byZone: { chacao: 12, "zona-de-maracaibo": 4 } },
      mcbo: {},
    });

    const { panel } = await buildFilterPanel(port, {
      ...PLACE,
      query: {},
      chosenZoneIds: [],
      criteria: { cityId: "dc" },
    });

    expect(panel.zones.map((zone) => zone.id)).toEqual(["chacao"]);
  });

  it("las salidas no cuestan una consulta: una por ciudad, con vacío o sin él", async () => {
    // **Es la restricción que decide todo el diseño.** Preguntar "¿cuántos
    // habría sin el precio?" de a un filtro eran nueve viajes de red sobre
    // Neon, y con el cierre de la lista harían falta en TODA búsqueda, no sólo
    // en el vacío. Los nueve números vienen ahora en la misma consulta.
    const { port, calls } = fakeFacets({
      dc: { total: 0, withoutFilter: { ...EMPTY.withoutFilter, price: 14 } },
      mcbo: { total: 23 },
    });

    await buildFilterPanel(port, {
      ...PLACE,
      query: { min: "250", hab: "2" },
      chosenZoneIds: [],
      criteria: { cityId: "dc", minPriceUsd: 250, minRooms: 2 },
    });

    expect(calls).toHaveLength(2);
  });

  it("el escalón siguiente de precio viaja en la misma pregunta", async () => {
    const { port, calls } = fakeFacets({ dc: { total: 3 }, mcbo: {} });

    await buildFilterPanel(port, {
      ...PLACE,
      query: { max: "700" },
      chosenZoneIds: [],
      criteria: { cityId: "dc", maxPriceUsd: 700 },
    });

    const own = calls.find((call) => call.criteria.cityId === "dc");

    expect(own?.widenedPrice).toEqual({ maxPriceUsd: 900 });
  });

  it("con cero resultados ofrece el filtro que más destraba, con su número", async () => {
    const { port } = fakeFacets({
      // Sin el precio hay 14; sin las habitaciones, 3.
      dc: { total: 0, withoutFilter: { ...EMPTY.withoutFilter, price: 14, rooms: 3 } },
      mcbo: { total: 23 },
    });

    const { panel, outcome } = await buildFilterPanel(port, {
      ...PLACE,
      query: { min: "250", hab: "2" },
      chosenZoneIds: [],
      criteria: { cityId: "dc", minPriceUsd: 250, minRooms: 2 },
    });

    expect(panel.confirm.kind).toBe("empty");
    const relief = panel.confirm.kind === "empty" ? panel.confirm.relief : null;

    expect(relief?.label).toBe("Quitar el precio y ver 14");
    expect(relief?.href).not.toContain("min=");
    // Y la pantalla recibe la misma salida que el botón del acordeón: dos
    // consejos distintos para el mismo cero es uno de más.
    expect(outcome.kind === "empty" && outcome.exits[0]?.label).toBe("Quitar el precio y ver 14");
  });

  it("con cero resultados y ningún filtro puesto no inventa una salida", async () => {
    const { port, calls } = fakeFacets({ dc: { total: 0 }, mcbo: { total: 23 } });

    const { panel } = await buildFilterPanel(port, {
      ...PLACE,
      query: {},
      chosenZoneIds: [],
      criteria: { cityId: "dc" },
    });

    expect(panel.confirm.kind).toBe("empty");
    expect(panel.confirm.kind === "empty" && panel.confirm.relief).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("con todos los avisos en pantalla, la lista cierra con el cambio que más suma (F10)", async () => {
    const { port } = fakeFacets({
      dc: {
        total: 9,
        cityTotal: 47,
        withoutFilter: { ...EMPTY.withoutFilter, price: 12, rooms: 11 },
        withWidenedPrice: 14,
      },
      mcbo: {},
    });

    const { outcome } = await buildFilterPanel(port, {
      ...PLACE,
      query: { max: "700", hab: "3" },
      chosenZoneIds: [],
      criteria: { cityId: "dc", maxPriceUsd: 700, minRooms: 3 },
    });

    expect(outcome.kind).toBe("complete");
    expect(outcome.kind === "complete" && outcome.closing).toBe("Son los 9 avisos que coinciden");
    expect(outcome.kind === "complete" && outcome.exit?.label).toBe("Ampliar a $900 y ver 14");
  });

  it("devuelve los conteos crudos, para que la pantalla no vuelva a pedirlos", async () => {
    const { port } = fakeFacets({ dc: { total: 16 }, mcbo: {} });

    const { counts } = await buildFilterPanel(port, {
      ...PLACE,
      query: {},
      chosenZoneIds: [],
      criteria: { cityId: "dc" },
    });

    expect(counts.total).toBe(16);
  });

  it("con un solo resultado el botón lleva a la ficha, no a una lista de uno (F7)", async () => {
    // La ficha la trae la pantalla, porque sale de las filas y no del conteo.
    // Que llegue hasta el botón es lo que evita una pantalla intermedia que
    // ya no informa nada: quien la abre acaba de leer que hay uno.
    const { port } = fakeFacets({ dc: { total: 1 }, mcbo: {} });

    const { panel } = await buildFilterPanel(port, {
      ...PLACE,
      query: {},
      chosenZoneIds: [],
      criteria: { cityId: "dc" },
      onlyListingHref: "/alquiler/distrito-capital/chacao/apto-84512",
    });

    expect(panel.confirm.kind).toBe("listing");
    expect(panel.confirm).toMatchObject({ href: "/alquiler/distrito-capital/chacao/apto-84512" });
  });

  it("sin la ficha a mano cae a la lista en vez de romperse", async () => {
    // Es el caso real de F9: el único resultado no tiene portada, así que no
    // entra en la cuadrícula y la pantalla no tiene una dirección que pasar.
    // Una pantalla de más es mejor que un botón que no lleva a ninguna parte.
    const { port } = fakeFacets({ dc: { total: 1 }, mcbo: {} });

    const { panel } = await buildFilterPanel(port, {
      ...PLACE,
      query: {},
      chosenZoneIds: [],
      criteria: { cityId: "dc" },
    });

    expect(panel.confirm.kind).toBe("results");
    expect(panel.confirm).toMatchObject({ label: "Ver 1 aviso" });
  });
});
