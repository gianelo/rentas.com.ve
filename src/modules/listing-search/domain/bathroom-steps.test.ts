import { describe, expect, it } from "vitest";
import {
  BATHROOM_STEPS,
  bathroomStepLabel,
  isBathroomStep,
  LAST_BATHROOM_STEP,
} from "./bathroom-steps";

/**
 * La misma regla que `room-steps.ts`, con **otra escala**: la lámina 7b dibuja
 * tres botones para los baños y cuatro para las habitaciones. Que sean dos
 * listas y no una es el dato que difiere; el «+» del último es la regla que se
 * repite porque significa lo mismo — el criterio es un mínimo.
 */
describe("los escalones del control de baños (14.45, lámina 7b)", () => {
  it("ofrece los tres que la lámina dibuja y ni uno más", () => {
    expect(BATHROOM_STEPS).toEqual([1, 2, 3]);
  });

  it("nombra el último en vez de dejar que cada pantalla lo deduzca", () => {
    expect(LAST_BATHROOM_STEP).toBe(3);
    expect(LAST_BATHROOM_STEP).toBe(BATHROOM_STEPS[BATHROOM_STEPS.length - 1]);
  });
});

describe("qué dice cada escalón en pantalla", () => {
  it("marca el último con un «+», porque «3» es tres o más y no exactamente tres", () => {
    // Sin el «+», un aviso de cuatro baños queda escondido de quien pide tres.
    expect(bathroomStepLabel(3)).toBe("3+");
  });

  it("dibuja los demás como el número solo", () => {
    expect(
      BATHROOM_STEPS.filter((step) => step !== LAST_BATHROOM_STEP).map(bathroomStepLabel),
    ).toEqual(["1", "2"]);
  });
});

describe("qué valores de una URL son un escalón", () => {
  it("acepta los tres y rechaza todo lo demás", () => {
    for (const step of BATHROOM_STEPS) expect(isBathroomStep(step)).toBe(true);

    // `?banos=4` es un criterio válido —cuatro baños o más— y no un escalón:
    // el control no tiene un botón para pedirlo, y esto responde por el control.
    expect(isBathroomStep(0)).toBe(false);
    expect(isBathroomStep(4)).toBe(false);
    expect(isBathroomStep(1.5)).toBe(false);
    expect(isBathroomStep("2")).toBe(false);
    expect(isBathroomStep(undefined)).toBe(false);
  });
});
