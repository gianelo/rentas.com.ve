import { describe, expect, it } from "vitest";
import type { PriceBucketTally } from "./price-histogram";
import { buildPriceStepHistogramView } from "./price-histogram-step";

/**
 * **El histograma del paso 3 de publicar** (tasks.md 18.9, rebanada D).
 *
 * La lámina de `Rentas - Publicar - Desktop` dibuja ocho barras sobre un eje
 * `$200`–`$1000`, con la franja de la mayoría marcada y la frase «La mayoría
 * pide entre $380 y $620. Tu precio está en el medio.». Esta cuenta produce
 * exactamente esos números, así que las aserciones se leen contra la lámina.
 */
const CHACAO: readonly PriceBucketTally[] = [
  { count: 1, lowestUsd: 200, highestUsd: 200 },
  { count: 2, lowestUsd: 310, highestUsd: 340 },
  { count: 5, lowestUsd: 380, highestUsd: 450 },
  { count: 6, lowestUsd: 500, highestUsd: 620 },
  { count: 3, lowestUsd: 650, highestUsd: 700 },
  { count: 2, lowestUsd: 720, highestUsd: 800 },
  { count: 1, lowestUsd: 900, highestUsd: 1000 },
  { count: 0 },
];

/** Tres avisos: pasa el eje pero no el piso de doce. */
const POCOS: readonly PriceBucketTally[] = [
  { count: 1, lowestUsd: 300, highestUsd: 300 },
  { count: 1, lowestUsd: 400, highestUsd: 400 },
  { count: 1, lowestUsd: 500, highestUsd: 500 },
];

function dibujo(priceUsd?: number, retypedPrice?: string) {
  const view = buildPriceStepHistogramView(CHACAO, { zoneName: "Chacao", priceUsd, retypedPrice });
  if (view.kind !== "distribution") throw new Error("se esperaba un histograma dibujable");
  return view;
}

describe("el paso 3 dibuja el mercado de la zona (18.9)", () => {
  it("mide cada barra contra la más alta y rotula el eje con avisos reales", () => {
    const view = dibujo();

    expect(view.bars.map((bar) => bar.heightPercent)).toEqual([17, 33, 83, 100, 50, 33, 17, 0]);
    expect(view.fromLabel).toBe("$200");
    expect(view.toLabel).toBe("$1000");
  });

  it("nombra la zona del borrador y no la ciudad", () => {
    expect(dibujo().heading).toBe("Precios en Chacao");
  });

  it("marca la franja de la mayoría y no el eje entero", () => {
    // Las dos barras de la lámina: $380–$450 y $500–$620. Se afirma la fila
    // ENTERA y no sólo las marcadas, porque marcarlas todas también daría dos.
    expect(dibujo().bars.map((bar) => bar.band)).toEqual([
      "rest",
      "rest",
      "typical",
      "typical",
      "rest",
      "rest",
      "rest",
      "rest",
    ]);
  });
});

describe("la frase del paso 3 tiene cuatro estados (18.9)", () => {
  it("sin precio puesto dice dónde está la mayoría y no juzga nada", () => {
    // Es el momento en que el histograma más sirve: alguien que no sabe qué
    // pedir. La frase de la lámina son DOS oraciones y sólo la primera es un
    // dato; la segunda es un juicio sobre un número que todavía no existe.
    expect(dibujo().summary).toBe("La mayoría pide entre $380 y $620.");
  });

  it("un precio adentro de la franja está en el medio", () => {
    expect(dibujo(450).summary).toBe(
      "La mayoría pide entre $380 y $620. Tu precio está en el medio.",
    );
  });

  it("un precio adentro del eje pero debajo de la franja NO está en el medio", () => {
    // $300 cae entre el $200 y el $1000 del eje: contra el eje diría «en el
    // medio» a quien está regalando el apartamento.
    expect(dibujo(300).summary).toBe(
      "La mayoría pide entre $380 y $620. Tu precio está por debajo.",
    );
  });

  it("un precio por encima de la franja lo dice", () => {
    expect(dibujo(700).summary).toBe(
      "La mayoría pide entre $380 y $620. Tu precio está por encima.",
    );
  });

  it("lo tecleado que el validador rechazó calla la posición, aunque el borrador guarde el anterior", () => {
    // El campo muestra `raw`, no el precio guardado: juzgar el guardado sería
    // una frase sobre un número que la pantalla ya no está mostrando.
    const view = dibujo(450, "cuatrocientos");

    expect(view.summary).toBe("La mayoría pide entre $380 y $620.");
    // Y el dibujo sigue entero: la negativa se dice arriba, junto al campo.
    expect(view.bars).toHaveLength(8);
  });
});

describe("por debajo del piso el paso 3 no dibuja un histograma vacío (18.9)", () => {
  it("dice cuántos avisos hay en la zona, y que el precio lo pone quien publica", () => {
    const view = buildPriceStepHistogramView(POCOS, { zoneName: "Chacao" });

    // Distinto de la lista (rebanada C): allá se explica una decoración que
    // falta; acá hay que impedir que tres vecinos le fijen el precio a alguien.
    expect(view).toEqual({
      kind: "insufficient",
      notice:
        "Con 3 avisos en Chacao no alcanza para decir cuánto se pide: el precio lo ponés vos.",
    });
  });

  it("un solo aviso se dice en singular", () => {
    const view = buildPriceStepHistogramView([{ count: 1, lowestUsd: 500, highestUsd: 500 }], {
      zoneName: "Chacao",
    });

    expect(view.kind === "insufficient" && view.notice).toContain("Con 1 aviso en Chacao");
  });

  it("ningún aviso se dice distinto de pocos avisos", () => {
    const view = buildPriceStepHistogramView([{ count: 0 }], { zoneName: "Chacao" });

    expect(view).toEqual({
      kind: "insufficient",
      notice: "Todavía no hay avisos en Chacao: el precio lo ponés vos.",
    });
  });
});

describe("una fila de barras es una imagen de datos (18.9)", () => {
  it("dice el dibujo en palabras, con cuántas barras marcan la franja", () => {
    expect(dibujo(450).caption).toBe(
      "Precios de $200 a $1000 en 8 barras: 2 marcan la franja donde se concentra la oferta.",
    );
  });
});
