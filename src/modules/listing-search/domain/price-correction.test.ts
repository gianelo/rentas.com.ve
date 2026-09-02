import { describe, expect, it } from "vitest";
import { priceCorrectionNotices, priceRangeNotices } from "./price-correction";
import type { PriceBucketTally } from "./price-histogram";

/** Extremos reales de lo que matcheó: $200 el más barato, $900 el más caro. */
const MATCHED = { lowestUsd: 200, highestUsd: 900 } as const;

describe("el precio al revés se corrige Y se dice (14.13, F5)", () => {
  it("dice que los dos números venían al revés, con los dos adentro", () => {
    const [dicho] = priceRangeNotices({ minUsd: 900, maxUsd: 300 }, MATCHED);

    expect(dicho).toContain("$900");
    expect(dicho).toContain("$300");
    expect(dicho).toContain("al revés");
  });

  /**
   * **El otro lado de la misma afirmación.** Una prueba que sólo mire el rango
   * invertido pasa igual si se anunciara un intercambio en TODA búsqueda.
   */
  it("un rango en orden no anuncia ninguna corrección", () => {
    expect(priceRangeNotices({ minUsd: 300, maxUsd: 900 }, MATCHED)).toEqual([]);
    // Iguales es un precio exacto, no un error; y con un solo extremo no hay
    // nada que comparar.
    expect(priceRangeNotices({ minUsd: 400, maxUsd: 400 }, MATCHED)).toEqual([]);
    expect(priceRangeNotices({ minUsd: 400 }, MATCHED)).toEqual([]);
    expect(priceRangeNotices({ maxUsd: 400 }, MATCHED)).toEqual([]);
  });
});

describe("lo que se sale del rango real se ajusta Y se dice (14.13, F5)", () => {
  it("un extremo flojo se ajusta al precio real y lo nombra, de los dos lados", () => {
    const [porAbajo] = priceRangeNotices({ minUsd: 100 }, MATCHED);
    const [porArriba] = priceRangeNotices({ maxUsd: 5000 }, MATCHED);

    expect(porAbajo).toBe("El mínimo de $100 se ajustó a $200: no hay nada más barato.");
    expect(porArriba).toBe("El máximo de $5000 se ajustó a $900: no hay nada más caro.");
  });

  /**
   * **El otro lado, y es el borde exacto.** Un ajuste que se anunciara siempre
   * pasaría las dos de arriba; lo que lo distingue es que el extremo que ya
   * está adentro —incluido el que cae JUSTO sobre el precio real— no se toca.
   */
  it("un extremo que ya está adentro del rango real no se ajusta", () => {
    expect(priceRangeNotices({ minUsd: 200, maxUsd: 900 }, MATCHED)).toEqual([]);
    expect(priceRangeNotices({ minUsd: 500, maxUsd: 600 }, MATCHED)).toEqual([]);
  });

  it("ajusta los dos extremos cuando los dos se salen, y lo dice de los dos", () => {
    expect(priceRangeNotices({ minUsd: 100, maxUsd: 5000 }, MATCHED)).toHaveLength(2);
  });

  it("primero se intercambia y después se ajusta: las tres frases salen", () => {
    const notices = priceRangeNotices({ minUsd: 5000, maxUsd: 100 }, MATCHED);

    expect(notices).toHaveLength(3);
    expect(notices[0]).toContain("al revés");
  });
});

/**
 * **La mitad que NO se aplica, y por qué se dice distinto.**
 *
 * Un extremo que pasó de largo el rango entero —un mínimo por encima del aviso
 * más caro— deja la lista vacía, así que ajustarlo cambiaría los resultados, y
 * los resultados ya se trajeron con el rango pedido. Anunciar un ajuste que no
 * ocurrió es la misma mentira que corregir en silencio, del otro lado.
 */
describe("un extremo que pasó de largo se explica, no se finge ajustado", () => {
  it("nombra el precio real de la punta que se pasó, y NO lo llama un ajuste", () => {
    const [porArriba] = priceRangeNotices({ minUsd: 5000 }, MATCHED);
    const [porAbajo] = priceRangeNotices({ maxUsd: 50 }, MATCHED);

    expect(porArriba).toContain("$5000");
    expect(porArriba).toContain("$900");
    expect(porAbajo).toContain("$50");
    expect(porAbajo).toContain("$200");
    // Y ninguna dice que lo ajustó, porque no lo ajustó.
    expect(porArriba).not.toContain("ajustó");
    expect(porAbajo).not.toContain("ajustó");
  });

  it("pasarse de largo se dice UNA vez: el otro extremo ya no recorta nada", () => {
    // $50–$100 contra $200–$900: el mínimo se sale por abajo y el máximo pasó
    // de largo. La lista está vacía por lo segundo, y explicar encima un ajuste
    // que no cambia nada es ruido sobre la única frase que importa.
    expect(priceRangeNotices({ minUsd: 50, maxUsd: 100 }, MATCHED)).toHaveLength(1);
  });

  it("sin precios reales no se inventa ninguno: el ajuste se calla", () => {
    expect(priceRangeNotices({ minUsd: 100, maxUsd: 5000 }, null)).toEqual([]);
    // El intercambio no depende de ellos y sigue diciéndose.
    expect(priceRangeNotices({ minUsd: 900, maxUsd: 300 }, null)).toHaveLength(1);
  });
});

/** La composición sobre lo que la pantalla tiene a mano: la dirección y los cubos. */
describe("se lee de la dirección y de los cubos que la consulta ya trajo", () => {
  const TALLY: readonly PriceBucketTally[] = [
    { count: 2, lowestUsd: 200, highestUsd: 280 },
    ...Array.from({ length: 6 }, () => ({ count: 0 })),
    { count: 3, lowestUsd: 850, highestUsd: 900 },
  ];

  it("saca los extremos de los cubos, sin una segunda pregunta", () => {
    expect(priceCorrectionNotices({ min: "100" }, TALLY)[0]).toContain("$200");
  });

  it("lee los dos nombres cortos de la dirección, no los del dominio", () => {
    expect(priceCorrectionNotices({ min: "900", max: "300" }, TALLY)[0]).toContain("al revés");
  });

  it("un precio que no es un número entero no llega a corregirse", () => {
    // Es lo mismo que `buildSearchCriteria` hace con él: se descarta. Un aviso
    // sobre un filtro que nunca se aplicó explicaría algo que no pasó.
    expect(priceCorrectionNotices({ min: "abc", max: "-1" }, TALLY)).toEqual([]);
    expect(priceCorrectionNotices({}, TALLY)).toEqual([]);
  });
});
