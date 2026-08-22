import { describe, expect, it } from "vitest";
import { isRoomStep, LAST_ROOM_STEP, ROOM_STEPS, roomStepLabel } from "./room-steps";

/**
 * Esta regla vivía en `components/molecules/SearchFilters.tsx`, dentro del
 * componente, y ése era el problema: el suelo de cobertura del 90 % llega a
 * `src/modules/<módulo>/domain/` y no llega a `components/`, así que "el 4 significa
 * cuatro o más" era una decisión de producto que ninguna corrida de tests
 * podía romper. Estos casos son lo que antes no existía.
 */
describe("los escalones del control de habitaciones (task 14.6/F4)", () => {
  it("ofrece cuatro escalones y ni uno más", () => {
    expect(ROOM_STEPS).toEqual([1, 2, 3, 4]);
  });

  it("nombra el último escalón, en vez de dejar que cada pantalla lo deduzca", () => {
    expect(LAST_ROOM_STEP).toBe(4);
    expect(LAST_ROOM_STEP).toBe(ROOM_STEPS[ROOM_STEPS.length - 1]);
  });
});

describe("qué dice cada escalón en pantalla", () => {
  it("marca el último con un «+», porque es el que puede esconder avisos", () => {
    // Un 4 pelado se lee como "exactamente cuatro" y deja fuera cada
    // apartamento más grande justo para quien más lo busca.
    expect(roomStepLabel(4)).toBe("4+");
  });

  it("dibuja los demás como el número solo, como los dibuja el artboard 2a", () => {
    expect(ROOM_STEPS.filter((step) => step !== LAST_ROOM_STEP).map(roomStepLabel)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });
});

describe("qué valores de una URL son un escalón", () => {
  it("acepta los cuatro y rechaza todo lo demás", () => {
    for (const step of ROOM_STEPS) expect(isRoomStep(step)).toBe(true);

    // 5 y 0 no son escalones aunque sean números de habitaciones válidos:
    // el control ofrece cuatro opciones y "5" no es una de ellas.
    expect(isRoomStep(0)).toBe(false);
    expect(isRoomStep(5)).toBe(false);
    expect(isRoomStep(2.5)).toBe(false);
    expect(isRoomStep("2")).toBe(false);
    expect(isRoomStep(undefined)).toBe(false);
  });
});
