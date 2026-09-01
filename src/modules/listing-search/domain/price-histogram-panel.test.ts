import { describe, expect, it } from "vitest";
import type { PriceBucketTally } from "./price-histogram";
import { buildPriceHistogramView, type PriceHistogramView } from "./price-histogram-panel";
import type { SearchSelection } from "./search-accordion";

/**
 * **La barra partida por el borde, que es la decisión que esta rebanada
 * existe para tomar.** Sin estos casos, «dentro del rango» es una diferencia
 * de color que ninguna corrida puede poner roja — y el color, dice
 * `violation-copy.ts`, es invisible para quien no distingue colores.
 */

function bucket(count: number, lowestUsd: number, highestUsd: number): PriceBucketTally {
  return { count, lowestUsd, highestUsd };
}

const empty: PriceBucketTally = { count: 0 };

/**
 * Los ocho cubos de la lámina, con precios reales adentro de cada uno.
 *
 * El eje va de $200 a $1000 como la lámina, así que cada cubo mide $100. El
 * primero llega hasta $290 y el sexto arranca en $720: son justamente los dos
 * que el rango $250–$700 de la lámina parte por el borde.
 */
const lamina: readonly PriceBucketTally[] = [
  bucket(3, 200, 290),
  bucket(6, 305, 395),
  bucket(11, 402, 495),
  bucket(9, 505, 598),
  bucket(7, 610, 690),
  bucket(4, 720, 780),
  bucket(2, 830, 880),
  bucket(1, 1000, 1000),
];

const CARACAS: SearchSelection = { cityName: "Caracas", zoneNames: [] };

function view(
  tally: readonly PriceBucketTally[] = lamina,
  selection: Partial<SearchSelection> = {},
): PriceHistogramView {
  return buildPriceHistogramView(tally, { ...CARACAS, ...selection });
}

/** Afirma que se dibujó y estrecha el tipo: la negativa es la otra mitad de la regla. */
function drawn(
  tally: readonly PriceBucketTally[] = lamina,
  selection: Partial<SearchSelection> = {},
) {
  const result = view(tally, selection);
  if (result.kind !== "distribution") throw new Error("debería dibujarse");
  return result;
}

function places(selection: Partial<SearchSelection>): readonly string[] {
  return drawn(lamina, selection).bars.map((bar) => bar.placement);
}

describe("qué barras quedan dentro del rango elegido", () => {
  it("una barra queda adentro cuando alguno de sus precios reales entra en el rango", () => {
    // El cubo 1 va de $200 a $290 y el mínimo es $250: tiene avisos que la
    // búsqueda SÍ devuelve, así que pintarlo afuera sería esconder oferta que
    // el filtro ya está entregando.
    expect(places({ minPriceUsd: 250, maxPriceUsd: 700 })[0]).toBe("within");
  });

  it("y queda afuera cuando NINGUNO entra, que es la única afirmación segura", () => {
    // El cubo 6 arranca en $720, por encima del máximo de $700: ni un aviso
    // suyo cabe en el rango. La lámina lo pinta en `--accent`; los precios
    // reales dicen que no.
    expect(places({ minPriceUsd: 250, maxPriceUsd: 700 })[5]).toBe("outside");
  });

  it("los dos bordes se deciden con la MISMA regla, no una por punta", () => {
    // La contradicción de la lámina en una sola línea: abajo pedía el cubo
    // entero, arriba se conformaba con rozarlo. Acá las dos puntas contestan
    // igual, y por eso el resultado es simétrico.
    expect(places({ minPriceUsd: 290, maxPriceUsd: 720 })[0]).toBe("within");
    expect(places({ minPriceUsd: 290, maxPriceUsd: 720 })[5]).toBe("within");
    expect(places({ minPriceUsd: 291, maxPriceUsd: 719 })[0]).toBe("outside");
    expect(places({ minPriceUsd: 291, maxPriceUsd: 719 })[5]).toBe("outside");
  });

  it("sin rango elegido ninguna barra queda afuera: no hay nada que excluya", () => {
    expect(places({})).not.toContain("outside");
    expect(places({})).toContain("within");
  });

  it("con un solo extremo puesto, el otro no recorta nada", () => {
    expect(places({ minPriceUsd: 600 })).toEqual([
      "outside",
      "outside",
      "outside",
      "outside",
      "within",
      "within",
      "within",
      "within",
    ]);
    expect(places({ maxPriceUsd: 400 })).toEqual([
      "within",
      "within",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
    ]);
  });

  it("un cubo vacío no está adentro de ningún rango: no tiene con qué estarlo", () => {
    const conHueco = [bucket(6, 200, 290), empty, ...lamina.slice(2)];

    expect(drawn(conHueco, {}).bars[1]?.placement).toBe("outside");
    expect(drawn(conHueco, {}).bars[0]?.placement).toBe("within");
  });

  it("la altura se mide contra la barra más alta y llega a 100", () => {
    const alturas = drawn().bars.map((bar) => bar.heightPercent);

    expect(Math.max(...alturas)).toBe(100);
    expect(alturas[0]).toBe(27);
  });
});

describe("la frase que nombra dónde está mirando", () => {
  it("con una zona elegida nombra esa zona", () => {
    expect(drawn(lamina, { zoneNames: ["Chacao"] }).summary).toBe(
      "En Chacao, la mayoría está entre $402 y $690.",
    );
  });

  it("sin ninguna zona nombra la ciudad, y no deja el hueco «En , la mayoría»", () => {
    const { summary } = drawn();

    expect(summary).toContain("En Caracas, la mayoría está entre");
    expect(summary).not.toContain("En ,");
  });

  it("con dos zonas las une con «y», como la lámina", () => {
    expect(drawn(lamina, { zoneNames: ["Chacao", "Altamira"] }).summary).toContain(
      "En Chacao y Altamira,",
    );
  });

  it("con tres van comas y una sola «y» al final", () => {
    expect(drawn(lamina, { zoneNames: ["Chacao", "Altamira", "Las Mercedes"] }).summary).toContain(
      "En Chacao, Altamira y Las Mercedes,",
    );
  });

  it("sin ciudad ni zona no hay frase: falla cerrado en vez de escribir «En ,»", () => {
    const { summary, bars } = drawn(lamina, { cityName: "" });

    expect(summary).toBeNull();
    // El dibujo sigue estando: lo que se calla es la frase, no el histograma.
    expect(bars).toHaveLength(8);
  });
});

describe("lo que se dibuja cuando no alcanzan los avisos", () => {
  it("por debajo del piso dice CUÁNTOS hay, que no es lo mismo que no haber ninguno", () => {
    const result = view([bucket(7, 300, 480), ...lamina.slice(1).map(() => empty)]);

    expect(result.kind).toBe("insufficient");
    expect(result.kind === "insufficient" && result.notice).toContain("7 avisos");
  });

  it("un solo aviso se dice en singular", () => {
    const result = view([bucket(1, 300, 300), ...lamina.slice(1).map(() => empty)]);

    expect(result.kind === "insufficient" && result.notice).toContain("1 aviso ");
  });

  it("sin un solo aviso lo dice distinto: cero y «son pocos» significan lo contrario", () => {
    const result = view(lamina.map(() => empty));
    const pocos = view([bucket(7, 300, 480), ...lamina.slice(1).map(() => empty)]);

    expect(result.kind === "insufficient" && result.notice).not.toBe(
      pocos.kind === "insufficient" && pocos.notice,
    );
    expect(result.kind === "insufficient" && result.notice).not.toContain("0 avisos");
  });
});

describe("lo que oye quien no ve el dibujo", () => {
  it("el texto alternativo dice los extremos y cuántas barras quedan adentro", () => {
    const { caption, fromLabel, toLabel } = drawn(lamina, {
      minPriceUsd: 250,
      maxPriceUsd: 700,
    });

    expect(fromLabel).toBe("$200");
    expect(toLabel).toBe("$1000");
    expect(caption).toContain("$200");
    expect(caption).toContain("$1000");
    expect(caption).toContain("5");
  });

  it("sin rango elegido lo dice, en vez de afirmar que todas están adentro", () => {
    expect(drawn().caption).not.toContain("rango elegido");
  });
});
