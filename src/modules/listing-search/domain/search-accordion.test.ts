import { describe, expect, it } from "vitest";
import {
  countActiveFilters,
  nextSearchStep,
  readSearchStep,
  resolveSearchSteps,
  SEARCH_STEPS,
  type SearchSelection,
  searchHeadline,
  summariseSearch,
} from "./search-accordion";

const CARACAS: SearchSelection = { cityName: "Distrito Capital", zoneNames: [] };

function step(selection: SearchSelection, id: string, open?: Parameters<typeof resolveSearchSteps>[1]) {
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
