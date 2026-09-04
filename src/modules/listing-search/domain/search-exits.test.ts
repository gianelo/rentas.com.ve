import { describe, expect, it } from "vitest";
import { resolvePagination } from "./pagination";
import type { RelaxableFilter } from "./search-confirm";
import {
  PRICE_STEPS,
  resolveSearchOutcome,
  type SearchOutcomeInput,
  widenPrice,
} from "./search-exits";

const NOTHING: Readonly<Record<RelaxableFilter, number>> = {
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
};

/**
 * **Los ids NO se parecen a los slugs, y eso es la mitad de lo que estas
 * pruebas verifican.**
 *
 * Estas fixtures decían `id: "centro"` y la dirección `?zona=centro`, así que
 * pasaban leyera el código el id o el slug. Es exactamente la ceguera que dejó
 * meses publicando hashes en la URL sin que nada fallara. Con ids con forma de
 * hash, una dirección armada con ids se ve mal a simple vista.
 */
const CENTRO = "9f1c0d2e-0000-4000-8000-000000000001";
const NORTE = "4da5ef52-0000-4000-8000-000000000002";
const SUR = "aefc8ef8-0000-4000-8000-000000000003";

const PLACE = {
  basePath: "/alquiler/maracaibo",
  cityPath: "/alquiler/maracaibo",
  cityName: "Maracaibo",
  zones: [
    { id: CENTRO, name: "Centro", slug: "centro", path: "/alquiler/maracaibo/centro" },
    { id: NORTE, name: "Norte", slug: "norte", path: "/alquiler/maracaibo/norte" },
    { id: SUR, name: "Sur", slug: "sur", path: "/alquiler/maracaibo/sur" },
  ],
};

function outcome(
  input: Partial<Omit<SearchOutcomeInput, "counts">> & {
    readonly total: number;
    readonly counts?: Partial<SearchOutcomeInput["counts"]>;
  },
) {
  const { total, ...rest } = input;
  return resolveSearchOutcome({
    ...PLACE,
    query: {},
    criteria: { cityId: "mcbo" },
    chosenZoneIds: [],
    pagination: resolvePagination(undefined, total),
    ...rest,
    counts: {
      total,
      cityTotal: total,
      byZone: {},
      withoutFilter: NOTHING,
      ...rest.counts,
    },
  });
}

describe("el vacío nombra el filtro que lo causa (F11)", () => {
  it("dice cuál es el filtro, no un mensaje genérico", () => {
    const result = outcome({
      total: 0,
      query: { max: "700", hab: "3" },
      criteria: { cityId: "mcbo", maxPriceUsd: 700, minRooms: 3 },
      counts: { total: 0, cityTotal: 47, byZone: {}, withoutFilter: { ...NOTHING, rooms: 12 } },
    });

    expect(result.kind).toBe("empty");
    // La mutación que esto atrapa: nombrar el precio —el otro filtro puesto—
    // deja la frase impecable y equivocada.
    expect(result.kind === "empty" && result.cause).toContain("3 hab");
    expect(result.kind === "empty" && result.cause).not.toContain("Hasta $700");
  });

  it("cuando ningún filtro solo alcanza, lo dice en vez de culpar a uno", () => {
    const result = outcome({
      total: 0,
      query: { max: "700", hab: "3" },
      criteria: { cityId: "mcbo", maxPriceUsd: 700, minRooms: 3 },
      counts: { total: 0, cityTotal: 47, byZone: {}, withoutFilter: NOTHING },
    });

    expect(result.kind === "empty" && result.cause).toContain("combinación");
    expect(result.kind === "empty" && result.cause).toContain("Hasta $700");
    expect(result.kind === "empty" && result.cause).toContain("3 hab");
  });

  it("una ciudad sin un solo aviso no culpa a ningún filtro", () => {
    const result = outcome({ total: 0, counts: { total: 0, cityTotal: 0 } });

    expect(result.kind === "empty" && result.cause).toBe(
      "Todavía no hay avisos publicados en Maracaibo.",
    );
    expect(result.kind === "empty" && result.exits).toEqual([]);
  });
});

describe("hasta tres salidas, cada una con su conteo real (F11)", () => {
  const THREE: Partial<SearchOutcomeInput> = {
    query: { zona: "centro", max: "700" },
    criteria: { cityId: "mcbo", zoneIds: [CENTRO], maxPriceUsd: 700 },
    chosenZoneIds: [CENTRO],
  };

  it("ofrece soltar el filtro, ampliar el precio y sumar la zona vecina", () => {
    const result = outcome({
      ...THREE,
      total: 0,
      counts: {
        total: 0,
        cityTotal: 47,
        byZone: { [CENTRO]: 0, [NORTE]: 12, [SUR]: 4 },
        withoutFilter: { ...NOTHING, zone: 16, price: 21 },
        withWidenedPrice: 5,
      },
    });

    const exits = result.kind === "empty" ? result.exits : [];

    expect(exits.map((exit) => exit.kind)).toEqual(["drop", "widen-price", "add-zone"]);
    expect(exits.map((exit) => exit.resultCount)).toEqual([21, 5, 12]);
    expect(exits.map((exit) => exit.label)).toEqual([
      "Quitar el precio y ver 21",
      "Ampliar a $900 y ver 5",
      "Agregar Norte y ver 12",
    ]);
  });

  it("la zona vecina que ofrece es la de más oferta, no la primera", () => {
    const result = outcome({
      ...THREE,
      total: 0,
      counts: {
        total: 0,
        cityTotal: 47,
        // `norte` viene antes en el catálogo y tiene menos: elegir la primera
        // ofrecería 4 donde había 12.
        byZone: { [CENTRO]: 0, [NORTE]: 4, [SUR]: 12 },
        withoutFilter: { ...NOTHING, zone: 16 },
      },
    });

    const exits = result.kind === "empty" ? result.exits : [];
    const zone = exits.find((exit) => exit.kind === "add-zone");

    expect(zone?.label).toBe("Agregar Sur y ver 12");
  });

  it("ninguna salida lleva a otro vacío", () => {
    const result = outcome({
      ...THREE,
      total: 0,
      counts: {
        total: 0,
        cityTotal: 47,
        byZone: { [CENTRO]: 0, [NORTE]: 0, [SUR]: 0 },
        withoutFilter: { ...NOTHING, price: 9 },
        // Ampliar al siguiente escalón no suma nada: no es una salida.
        withWidenedPrice: 0,
      },
    });

    const exits = result.kind === "empty" ? result.exits : [];

    expect(exits.map((exit) => exit.kind)).toEqual(["drop"]);
    expect(exits.every((exit) => exit.resultCount > 0)).toBe(true);
  });

  it("nunca ofrece otra ciudad: toda salida se queda dentro de ésta", () => {
    const result = outcome({
      ...THREE,
      total: 0,
      counts: {
        total: 0,
        cityTotal: 47,
        byZone: { [CENTRO]: 0, [NORTE]: 12 },
        withoutFilter: { ...NOTHING, zone: 16, price: 21 },
        withWidenedPrice: 5,
      },
    });

    const exits = result.kind === "empty" ? result.exits : [];

    expect(exits).not.toHaveLength(0);
    expect(exits.every((exit) => exit.href.startsWith("/alquiler/maracaibo"))).toBe(true);
  });

  it("sin ninguna salida de un solo cambio, limpiar todo es la salida y trae su número", () => {
    const result = outcome({
      total: 0,
      query: { max: "700", hab: "3" },
      criteria: { cityId: "mcbo", maxPriceUsd: 700, minRooms: 3 },
      counts: { total: 0, cityTotal: 47, byZone: {}, withoutFilter: NOTHING },
    });

    const exits = result.kind === "empty" ? result.exits : [];

    expect(exits).toEqual([
      {
        kind: "clear-all",
        label: "Limpiar todo y ver 47",
        href: "/alquiler/maracaibo",
        resultCount: 47,
      },
    ]);
  });
});

describe("el cierre de la lista (F10)", () => {
  it("dice que están todos y propone la relajación que más suma", () => {
    const result = outcome({
      total: 9,
      query: { max: "700", hab: "3" },
      criteria: { cityId: "mcbo", maxPriceUsd: 700, minRooms: 3 },
      counts: {
        total: 9,
        cityTotal: 47,
        byZone: {},
        // Soltar las habitaciones suma 2; ampliar el precio suma 5. Elegir la
        // primera candidata en vez de la que más suma es la mutación.
        withoutFilter: { ...NOTHING, rooms: 11, price: 12 },
        withWidenedPrice: 14,
      },
    });

    expect(result.kind).toBe("complete");
    expect(result.kind === "complete" && result.closing).toBe("Son los 9 avisos que coinciden");
    expect(result.kind === "complete" && result.exit?.label).toBe("Ampliar a $900 y ver 14");
  });

  it("sumar la zona vecina promete los que hay MÁS los que suma", () => {
    // La mutación: prometer sólo los 5 de la zona nueva. Las zonas se combinan
    // con O, así que quien toca ese enlace ve 14 y la etiqueta habría dicho 5.
    const result = outcome({
      total: 9,
      query: { zona: "centro" },
      criteria: { cityId: "mcbo", zoneIds: [CENTRO] },
      chosenZoneIds: [CENTRO],
      counts: {
        total: 9,
        cityTotal: 47,
        byZone: { [CENTRO]: 9, [NORTE]: 5 },
        withoutFilter: NOTHING,
      },
    });

    expect(result.kind === "complete" && result.exit?.label).toBe("Agregar Norte y ver 14");
  });

  /**
   * **La salida «sumar la zona vecina» CAMBIA de forma de ruta** — y es la
   * consecuencia que la resolución de ubicación del fundador (2026-08-26) tiene
   * sobre esta salida.
   *
   * Con una zona la dirección es `/alquiler/<ciudad>/<zona>`, indexable; con dos
   * no existe la ruta de «Centro o Norte», así que caen en la ciudad con la
   * lista en la query — que es la forma que la resolución marca `noindex`. La
   * promesa de la 14.14 no cambia: sigue sumando y sigue diciendo cuántos. Lo
   * que cambia es adónde lleva, y **eso no estaba atado por ninguna prueba**:
   * el `label` era lo único afirmado.
   */
  it("y esa suma cambia de forma de ruta: de la zona a la ciudad con la lista", () => {
    const result = outcome({
      total: 9,
      basePath: "/alquiler/maracaibo/centro",
      query: {},
      criteria: { cityId: "mcbo", zoneIds: [CENTRO] },
      chosenZoneIds: [CENTRO],
      counts: {
        total: 9,
        cityTotal: 47,
        byZone: { [CENTRO]: 9, [NORTE]: 5 },
        withoutFilter: NOTHING,
      },
    });

    expect(result.kind === "complete" && result.exit?.href).toBe(
      "/alquiler/maracaibo?zona=centro%2Cnorte",
    );
  });

  it("con un solo aviso la frase sigue siendo una frase", () => {
    const result = outcome({ total: 1, counts: { total: 1, cityTotal: 1 } });

    expect(result.kind === "complete" && result.closing).toBe("Es el único aviso que coincide");
  });

  it("sin un filtro que soltar no inventa un botón", () => {
    const result = outcome({ total: 9, counts: { total: 9, cityTotal: 9 } });

    expect(result.kind === "complete" && result.exit).toBeNull();
  });

  it("a mitad de la lista no cierra nada: todavía faltan avisos", () => {
    const result = outcome({
      total: 60,
      counts: { total: 60, cityTotal: 60, byZone: {}, withoutFilter: { ...NOTHING, price: 90 } },
      criteria: { cityId: "mcbo", maxPriceUsd: 700 },
      pagination: resolvePagination(1, 60),
    });

    expect(result.kind).toBe("partial");
  });

  it("en la última página sí cierra, porque ahí se acabaron", () => {
    const result = outcome({
      total: 60,
      counts: { total: 60, cityTotal: 60, byZone: {}, withoutFilter: { ...NOTHING, price: 90 } },
      criteria: { cityId: "mcbo", maxPriceUsd: 700 },
      pagination: resolvePagination(3, 60),
    });

    expect(result.kind).toBe("complete");
    expect(result.kind === "complete" && result.exit?.label).toBe("Quitar el precio y ver 90");
  });

  it("una página que ya no existe no se cierra: ésa tiene su propia salida", () => {
    const result = outcome({
      total: 9,
      counts: { total: 9, cityTotal: 9 },
      pagination: resolvePagination(7, 9),
    });

    expect(result.kind).toBe("partial");
  });
});

describe("el siguiente escalón de precio", () => {
  it("sube el techo al escalón de arriba", () => {
    expect(widenPrice({ maxPriceUsd: 700 })).toEqual({ maxPriceUsd: 900 });
  });

  it("conserva el otro extremo: ampliar no es empezar de nuevo", () => {
    expect(widenPrice({ minPriceUsd: 250, maxPriceUsd: 700 })).toEqual({
      minPriceUsd: 250,
      maxPriceUsd: 900,
    });
  });

  it("un techo entre dos escalones sube al de arriba, no al de al lado", () => {
    expect(widenPrice({ maxPriceUsd: 750 })).toEqual({ maxPriceUsd: 900 });
  });

  it("sin techo baja el piso, que es la otra forma de ampliar", () => {
    expect(widenPrice({ minPriceUsd: 300 })).toEqual({ minPriceUsd: 250 });
  });

  it("arriba del último escalón no hay escalón: soltar el precio es la salida", () => {
    expect(widenPrice({ maxPriceUsd: PRICE_STEPS[PRICE_STEPS.length - 1] })).toBeNull();
  });

  it("sin precio no hay nada que ampliar", () => {
    expect(widenPrice({})).toBeNull();
  });

  it("los escalones suben, y ninguno se repite", () => {
    expect([...PRICE_STEPS]).toEqual([...PRICE_STEPS].slice().sort((a, b) => a - b));
    expect(new Set(PRICE_STEPS).size).toBe(PRICE_STEPS.length);
  });
});
