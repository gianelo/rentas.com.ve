import { describe, expect, it } from "vitest";
import {
  countActiveFilters,
  countPillFilters,
  nextSearchStep,
  readSearchStep,
  resolveSearchSteps,
  SEARCH_STEPS,
  type SearchSelection,
  searchHeadline,
  summariseSearch,
} from "./search-accordion";

const CARACAS: SearchSelection = { cityName: "Distrito Capital", zoneNames: [] };

function step(
  selection: SearchSelection,
  id: string,
  open?: Parameters<typeof resolveSearchSteps>[1],
) {
  const found = resolveSearchSteps(selection, open).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`el paso ${id} no existe`);
  return found;
}

describe("los cuatro pasos, y su orden", () => {
  it("son ciudad, zona, precio y habitaciones, en ese orden", () => {
    expect(SEARCH_STEPS).toEqual(["ciudad", "zona", "precio", "habitaciones"]);
  });

  it("cada paso lleva su número, y el número sale de la lista", () => {
    expect(resolveSearchSteps(CARACAS).map((view) => view.position)).toEqual([1, 2, 3, 4]);
  });

  it("el siguiente de cada uno es el que sigue, y el último no tiene", () => {
    expect(nextSearchStep("ciudad")).toBe("zona");
    expect(nextSearchStep("zona")).toBe("precio");
    expect(nextSearchStep("precio")).toBe("habitaciones");
    expect(nextSearchStep("habitaciones")).toBeNull();
  });

  it("lee el paso de la dirección y descarta lo que no es un paso", () => {
    expect(readSearchStep("zona")).toBe("zona");
    expect(readSearchStep("  precio  ")).toBe("precio");
    expect(readSearchStep("constructor")).toBeUndefined();
    expect(readSearchStep("")).toBeUndefined();
    expect(readSearchStep(undefined)).toBeUndefined();
  });
});

describe("un solo paso abierto a la vez (F3 a F6, acordeón secuencial)", () => {
  it("abre el que pide la dirección", () => {
    const open = resolveSearchSteps(CARACAS, "precio").filter((view) => view.open);

    expect(open.map((view) => view.id)).toEqual(["precio"]);
  });

  it("sin nada pedido abre el primero sin contestar", () => {
    // La ciudad la afirma la ruta, así que el primero pendiente es la zona.
    const open = resolveSearchSteps(CARACAS).filter((view) => view.open);

    expect(open.map((view) => view.id)).toEqual(["zona"]);
  });

  it("con la zona elegida sigue con el precio", () => {
    const open = resolveSearchSteps({ ...CARACAS, zoneNames: ["Chacao"] }).filter(
      (view) => view.open,
    );

    expect(open.map((view) => view.id)).toEqual(["precio"]);
  });

  it("con todo contestado no queda ninguno abierto", () => {
    const open = resolveSearchSteps({
      ...CARACAS,
      zoneNames: ["Chacao"],
      maxPriceUsd: 700,
      minRooms: 2,
    }).filter((view) => view.open);

    expect(open).toEqual([]);
  });

  it("nunca hay dos abiertos, ni siquiera pidiendo el que ya está contestado", () => {
    const open = resolveSearchSteps({ ...CARACAS, zoneNames: ["Chacao"] }, "ciudad").filter(
      (view) => view.open,
    );

    expect(open.map((view) => view.id)).toEqual(["ciudad"]);
  });
});

describe("cada paso cerrado muestra lo elegido", () => {
  it("la ciudad muestra su nombre y siempre está contestada", () => {
    expect(step(CARACAS, "ciudad").summary).toBe("Distrito Capital");
    expect(step(CARACAS, "ciudad").answered).toBe(true);
  });

  it("sin zonas dice «Todas», no un vacío", () => {
    expect(step(CARACAS, "zona").summary).toBe("Todas");
    expect(step(CARACAS, "zona").answered).toBe(false);
  });

  it("con varias zonas las nombra a todas, porque se combinan con O", () => {
    const view = step({ ...CARACAS, zoneNames: ["Chacao", "Altamira"] }, "zona");

    expect(view.summary).toBe("Chacao, Altamira");
    expect(view.answered).toBe(true);
  });

  it("el precio dice el rango, o de qué lado está abierto", () => {
    expect(step(CARACAS, "precio").summary).toBe("Cualquiera");
    expect(step({ ...CARACAS, minPriceUsd: 250, maxPriceUsd: 700 }, "precio").summary).toBe(
      "$250 – $700",
    );
    expect(step({ ...CARACAS, minPriceUsd: 250 }, "precio").summary).toBe("Desde $250");
    expect(step({ ...CARACAS, maxPriceUsd: 700 }, "precio").summary).toBe("Hasta $700");
  });

  it("las habitaciones dicen el escalón, y el último dice «o más»", () => {
    expect(step(CARACAS, "habitaciones").summary).toBe("Cualquiera");
    expect(step({ ...CARACAS, minRooms: 2 }, "habitaciones").summary).toBe("2 hab");
    expect(step({ ...CARACAS, minRooms: 4 }, "habitaciones").summary).toBe("4+ hab");
  });

  it("cada paso lleva su pregunta, tal como la dibuja la lámina", () => {
    expect(step(CARACAS, "ciudad").question).toBe("¿En qué ciudad?");
    expect(step(CARACAS, "zona").question).toBe("¿Qué zonas?");
    expect(step(CARACAS, "precio").question).toBe("¿Cuánto podés pagar al mes?");
    expect(step(CARACAS, "habitaciones").question).toBe("¿Cuántas habitaciones?");
  });
});

describe("la barra resumen de resultados", () => {
  it("encabeza con las zonas elegidas, y con la ciudad si no hay ninguna", () => {
    expect(searchHeadline({ ...CARACAS, zoneNames: ["Chacao", "Altamira"] })).toBe(
      "Chacao, Altamira",
    );
    expect(searchHeadline(CARACAS)).toBe("Distrito Capital");
  });

  it("resume la búsqueda entera empezando por el conteo real", () => {
    const line = summariseSearch(
      {
        ...CARACAS,
        zoneNames: ["Chacao", "Altamira"],
        minPriceUsd: 250,
        maxPriceUsd: 700,
        minRooms: 2,
        publisherType: "owner",
      },
      9,
    );

    expect(line).toBe("9 avisos · $250 – $700 · 2 hab · dueños");
  });

  it("un solo aviso se dice en singular", () => {
    expect(summariseSearch(CARACAS, 1)).toBe("1 aviso");
  });

  it("sin filtros el resumen es sólo el conteo", () => {
    expect(summariseSearch(CARACAS, 47)).toBe("47 avisos");
  });

  it("cuenta los filtros puestos, y la ciudad NO es uno de ellos (F8)", () => {
    expect(countActiveFilters(CARACAS)).toBe(0);
    expect(
      countActiveFilters({
        ...CARACAS,
        zoneNames: ["Chacao", "Altamira"],
        minPriceUsd: 250,
        maxPriceUsd: 700,
        minRooms: 2,
        publisherType: "owner",
      }),
    ).toBe(4);
  });

  it("las zonas cuentan como un solo filtro, por muchas que sean", () => {
    expect(countActiveFilters({ ...CARACAS, zoneNames: ["a", "b", "c"] })).toBe(1);
  });

  it("cada atributo declarado cuenta por su cuenta: se combinan con Y", () => {
    expect(
      countActiveFilters({ ...CARACAS, attributes: ["hasPowerPlant", "hasRegularWater"] }),
    ).toBe(2);
  });
});

/**
 * **El número de la pastilla no es el del engranaje, y esto es la corrección de
 * una contradicción real entre dos contratos ya escritos.**
 *
 * `countActiveFilters` cuenta la zona como un filtro, porque el engranaje de la
 * barra resumen abría un acordeón que TENÍA un paso de zona. La 14.36 sacó
 * ciudad y zona del panel («la ubicación pasa a vivir SOLO en la ruta; los
 * filtros SOLO en la query»), y la 14i lo dice desde el otro lado: el filtro de
 * la pastilla «abre precio, tamaño, quién publica y atributos. Ciudad y zona no
 * están ahí: eso lo resuelve el texto».
 *
 * Y la lámina 7b/7c lo dibuja: con Chacao, Altamira, $250–$700, 2 habitaciones
 * y "solo de dueños" puestos, la pastilla dice **«3 filtros»** — no 4, no 5.
 *
 * Pasarle `activeFilters` a la pastilla habría dibujado un número que no es el
 * que abre nada, y no hay lámina ni prueba de dominio que se ponga roja por eso.
 */
describe("countPillFilters — lo que el filtro de la pastilla abre de verdad (14i)", () => {
  it("la zona NO cuenta: la resuelve el texto de la pastilla, no el panel", () => {
    expect(countPillFilters({ ...CARACAS, zoneNames: ["Chacao", "Altamira"] })).toBe(0);
  });

  it("el caso de la lámina 7c: precio, habitaciones y quién publica son 3", () => {
    expect(
      countPillFilters({
        ...CARACAS,
        zoneNames: ["Chacao", "Altamira"],
        minPriceUsd: 250,
        maxPriceUsd: 700,
        minRooms: 2,
        publisherType: "owner",
      }),
    ).toBe(3);
  });

  it("sin nada puesto es cero, y la ciudad tampoco cuenta (F8)", () => {
    expect(countPillFilters(CARACAS)).toBe(0);
  });

  it("cada atributo cuenta por su cuenta, igual que en el engranaje", () => {
    expect(countPillFilters({ ...CARACAS, attributes: ["hasPowerPlant", "hasRegularWater"] })).toBe(
      2,
    );
  });

  it("un solo extremo del precio ya es el filtro de precio", () => {
    expect(countPillFilters({ ...CARACAS, maxPriceUsd: 900 })).toBe(1);
    expect(countPillFilters({ ...CARACAS, minPriceUsd: 300 })).toBe(1);
  });

  /** La diferencia con el engranaje es exactamente una: la zona. */
  it("es el conteo del engranaje menos la zona, nunca otra cosa", () => {
    const withZones = {
      ...CARACAS,
      zoneNames: ["Chacao"],
      minRooms: 3,
      attributes: ["hasSecurity"] as const,
    };

    expect(countActiveFilters(withZones) - countPillFilters(withZones)).toBe(1);
    expect(countActiveFilters(CARACAS) - countPillFilters(CARACAS)).toBe(0);
  });
});
