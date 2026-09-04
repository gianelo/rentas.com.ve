import { describe, expect, it } from "vitest";
import type { FacetCounts, FacetedSearchPort } from "./faceted-search.port";

/**
 * El puerto de facetas hereda D5 **por tipo**, y eso lo revisa `pnpm
 * typecheck`, no esta corrida. Cada `@ts-expect-error` de abajo rompe la
 * compilación el día que deje de fallar — que es el día que alguien vuelva a
 * abrir la puerta a un conteo sin ciudad. Se escribe también como spec de
 * runtime para que el archivo sea un miembro normal de la suite.
 *
 * Lo que las cuentas realmente valen se prueba contra Postgres de verdad, en
 * tests/integration/faceted-search.test.ts: un doble en memoria contaría bien
 * porque fue escrito para contar bien.
 */

const VACIO: FacetCounts = {
  total: 0,
  byZone: {},
  byMinRooms: { 1: 0, 2: 0, 3: 0, 4: 0 },
  byMinBathrooms: { 1: 0, 2: 0, 3: 0 },
  byAttribute: {
    hasPowerPlant: 0,
    hasRegularWater: 0,
    isFurnished: 0,
    hasParking: 0,
    hasSecurity: 0,
    hasAppliances: 0,
  },
  byPropertyType: { apartamento: 0, casa: 0, quinta: 0, anexo: 0, habitacion: 0 },
  byPublisherType: { owner: 0, broker: 0 },
  withoutFilter: {
    zone: 0,
    price: 0,
    rooms: 0,
    bathrooms: 0,
    publisherType: 0,
    hasPowerPlant: 0,
    hasRegularWater: 0,
    isFurnished: 0,
    hasParking: 0,
    hasSecurity: 0,
    hasAppliances: 0,
    area: 0,
  },
  byPriceBucket: Array.from({ length: 8 }, () => ({ count: 0 })),
  cityTotal: 0,
};

const port: FacetedSearchPort = { countFacets: async () => VACIO };

describe("FacetedSearchPort no puede expresar un conteo sin ciudad (D5)", () => {
  it("exige el mismo criterio que la búsqueda de filas", async () => {
    // @ts-expect-error — `cityId` es obligatorio; no hay conteo de todo el país.
    await port.countFacets({ zoneId: "zone-1" }, []);
    // @ts-expect-error — y no es nulable, así que `null` no es un alcance.
    await port.countFacets({ cityId: null }, []);
    // @ts-expect-error — tampoco hay comodín: `undefined` no cuenta como ciudad.
    await port.countFacets({ cityId: undefined }, []);

    expect(await port.countFacets({ cityId: "city-1" }, [])).toEqual(VACIO);
  });
});

describe("FacetCounts", () => {
  /**
   * Los cinco tipos y los cinco atributos son `Record` completos, no mapas
   * parciales: una opción sin clave es una opción que la pantalla no puede
   * distinguir de una que vale cero, y la regla 4 vive justo en esa diferencia.
   */
  it("obliga a que cada opción de una lista cerrada tenga su número", () => {
    // @ts-expect-error — falta `habitacion`; un tipo sin conteo no compila.
    const incompleto: FacetCounts["byPropertyType"] = {
      apartamento: 1,
      casa: 0,
      quinta: 0,
      anexo: 0,
    };
    // @ts-expect-error — falta `hasAppliances`, por lo mismo.
    const sinAtributo: FacetCounts["byAttribute"] = {
      hasPowerPlant: 0,
      hasRegularWater: 0,
      isFurnished: 0,
      hasSecurity: 0,
    };

    expect(incompleto.apartamento).toBe(1);
    expect(sinAtributo.hasPowerPlant).toBe(0);
  });
});
