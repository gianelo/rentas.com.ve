import { describe, expect, it } from "vitest";
import { RESULTS_PER_PAGE } from "./pagination";
import {
  MIN_LISTINGS_FOR_PRICE_HISTOGRAM,
  PRICE_HISTOGRAM_BUCKETS,
  type PriceBucketTally,
  priceHistogram,
  pricePositionInBand,
} from "./price-histogram";

/**
 * El histograma lo leen DOS pantallas —la lista (F5) y el paso 3 de publicar
 * (18.9)—, así que la regla no puede vivir en ninguna. Sin estos casos, «la
 * mayoría está entre $380 y $620» es una frase que ninguna corrida puede
 * poner roja.
 */

/** Un cubo lleno, con los precios reales que cayeron adentro. */
function bucket(count: number, lowestUsd: number, highestUsd: number): PriceBucketTally {
  return { count, lowestUsd, highestUsd };
}

/** Un cubo sin nada. No lleva precios porque no hay ninguno que nombrar. */
const empty: PriceBucketTally = { count: 0 };

/** Ocho cubos con 32 avisos, concentrados en el tercero y el cuarto. */
const concentrated: readonly PriceBucketTally[] = [
  bucket(2, 200, 290),
  bucket(4, 305, 395),
  bucket(9, 402, 495),
  bucket(8, 505, 598),
  bucket(4, 610, 690),
  bucket(3, 720, 780),
  bucket(1, 880, 880),
  bucket(1, 1000, 1000),
];

/**
 * Afirma que se dibujó y estrecha el tipo. Repetir el `if` en cada caso hacía
 * que la negativa —que es la mitad de esta regla— se leyera como ruido.
 */
function drawn(tally: readonly PriceBucketTally[]) {
  const result = priceHistogram(tally);
  if (result.kind !== "distribution") throw new Error("debería dibujarse");
  return result;
}

describe("cuántos cubos se piden y desde cuántos avisos se dibuja", () => {
  it("pide ocho cubos, que es lo que dibujan tres de las cuatro láminas", () => {
    expect(PRICE_HISTOGRAM_BUCKETS).toBe(8);
  });

  it("deriva el piso de la página de resultados en vez de escribirlo a mano", () => {
    expect(MIN_LISTINGS_FOR_PRICE_HISTOGRAM).toBe(RESULTS_PER_PAGE / 2);
    expect(MIN_LISTINGS_FOR_PRICE_HISTOGRAM).toBe(12);
  });
});

describe("cuando hay pocos avisos el histograma se niega, y lo dice", () => {
  it("un aviso menos que el piso no se dibuja, y devuelve un estado propio", () => {
    const scarce = [bucket(5, 300, 380), bucket(6, 400, 480)];

    const result = priceHistogram(scarce);

    // «insufficient» y no un histograma vacío: para una pantalla los dos se
    // ven igual y significan lo contrario.
    expect(result.kind).toBe("insufficient");
    expect(result.total).toBe(11);
  });

  it("justo en el piso ya se dibuja: el límite se cumple, no se supera", () => {
    const exact = [bucket(6, 300, 380), bucket(6, 400, 480)];

    expect(priceHistogram(exact).kind).toBe("distribution");
    expect(priceHistogram(exact).total).toBe(MIN_LISTINGS_FOR_PRICE_HISTOGRAM);
  });

  it("sin un solo cubo tampoco inventa nada", () => {
    expect(priceHistogram([])).toEqual({ kind: "insufficient", total: 0 });
  });

  it("un cubo que dice tener avisos pero no sabe a qué precio no se dibuja", () => {
    // El cubo roto queda ADENTRO de la franja y entre dos que sí saben su
    // precio: sin esta negativa, la franja diría 22 avisos entre $300 y $680
    // contando cuatro que nadie sabe dónde caen. Falla cerrado (§7).
    const broken = [
      bucket(3, 200, 280),
      bucket(9, 300, 380),
      { count: 4 },
      bucket(9, 600, 680),
      bucket(3, 900, 980),
    ];

    const result = priceHistogram(broken);

    expect(result.kind).toBe("insufficient");
    // El total sigue siendo el real: se niega a dibujar, no a contar.
    expect(result.total).toBe(28);
  });

  it("y tampoco si el cubo roto queda FUERA de la franja de la mayoría", () => {
    // Lo que el caso anterior NO alcanza a probar: acá la franja gana sola en
    // el cubo del medio, así que rotularla sale bien y el cubo roto sólo
    // ensucia el EJE — el que dice cuál es el aviso más caro.
    const brokenEdge = [bucket(5, 200, 280), bucket(20, 400, 480), { count: 4 }];

    const result = priceHistogram(brokenEdge);

    expect(result.kind).toBe("insufficient");
    expect(result.total).toBe(29);
  });

  it("un conteo que no es un entero positivo tampoco pasa", () => {
    // Los dos llegan al piso de doce, así que no se caen por pocos sino por
    // no ser un conteo. Con menos, el piso los taparía y esto no probaría nada.
    expect(priceHistogram([{ count: 12.5, lowestUsd: 200, highestUsd: 300 }]).kind).toBe(
      "insufficient",
    );
    expect(
      priceHistogram([bucket(20, 200, 280), { count: -4, lowestUsd: 300, highestUsd: 380 }]).kind,
    ).toBe("insufficient");
  });
});

describe("los extremos del eje salen de los avisos y no de una escala fija", () => {
  it("el $200 y el $1000 de la lámina son el precio más barato y el más caro", () => {
    const result = drawn(concentrated);

    expect(result.lowestUsd).toBe(200);
    expect(result.highestUsd).toBe(1000);
    expect(result.total).toBe(32);
  });

  it("ignora los cubos vacíos de las puntas al nombrar los extremos", () => {
    const padded = [empty, ...concentrated.slice(0, 4), empty, empty];

    const result = drawn(padded);

    expect(result.lowestUsd).toBe(200);
    expect(result.highestUsd).toBe(598);
    // Los cubos vacíos siguen estando: el eje no se recorta, sólo su rótulo.
    expect(result.bars).toHaveLength(7);
  });
});

describe("la altura de cada barra", () => {
  it("se mide contra la barra más alta y no contra el total", () => {
    const result = drawn(concentrated);

    // Contra el total, la más alta daría 28 % donde la lámina dibuja 100 %.
    expect(result.bars.map((bar) => bar.share)).toEqual([
      2 / 9,
      4 / 9,
      1,
      8 / 9,
      4 / 9,
      3 / 9,
      1 / 9,
      1 / 9,
    ]);
  });

  it("una barra vacía mide cero, y sigue en la lista", () => {
    const result = drawn([empty, bucket(12, 400, 480), empty]);

    expect(result.bars.map((bar) => bar.count)).toEqual([0, 12, 0]);
    expect(result.bars.map((bar) => bar.share)).toEqual([0, 1, 0]);
  });
});

describe("«la mayoría», que es un número que aparece en pantalla", () => {
  it("es más de la mitad de verdad, y no la mitad justa", () => {
    const result = drawn(concentrated);

    // 9 + 8 = 17 sobre 32. La mitad justa (16) NO es mayoría, y decirlo sería
    // una etiqueta que miente (regla transversal 3).
    expect(result.typical.count).toBe(17);
    expect(result.typical.count * 2).toBeGreaterThan(result.total);

    // Y el caso que lo prueba de verdad: dos cubos de 6 sobre 12. Cada uno es
    // la mitad justa, así que la franja se abre a los dos.
    const halved = drawn([bucket(6, 300, 380), bucket(6, 400, 480)]);
    expect(halved.typical).toEqual({ fromUsd: 300, toUsd: 480, count: 12 });
  });

  it("rotula la franja con precios que alguien pidió de verdad", () => {
    const result = drawn(concentrated);

    // El aviso más barato y el más caro DENTRO de la franja, no el borde
    // nominal: la lámina dice «$380 y $620» y ningún borde calculado da eso.
    expect(result.typical.fromUsd).toBe(402);
    expect(result.typical.toUsd).toBe(598);
  });

  it("elige la franja más angosta que alcanza la mayoría, no la primera", () => {
    // El cubo del medio solo ya es mayoría (13 de 24): dos serían igual de
    // ciertos y el doble de anchos, y una franja ancha no dice nada.
    const peaked = [bucket(5, 200, 280), bucket(13, 400, 460), bucket(6, 700, 800)];

    const result = drawn(peaked);

    expect(result.typical).toEqual({ fromUsd: 400, toUsd: 460, count: 13 });
  });

  it("con dos franjas igual de angostas se queda con la que tiene más avisos", () => {
    const twin = [bucket(9, 200, 280), bucket(2, 300, 380), bucket(10, 500, 580)];

    const result = drawn(twin);

    // 9+2 = 11 y 2+10 = 12: las dos son mayoría de 21 y miden dos cubos.
    // Gana la más cargada, que es donde está la oferta.
    expect(result.typical).toEqual({ fromUsd: 300, toUsd: 580, count: 12 });
  });

  it("cuando la oferta está repartida la franja se ensancha en vez de mentir", () => {
    const flat = [bucket(4, 200, 280), bucket(4, 300, 380), bucket(4, 500, 580)];

    const result = drawn(flat);

    // Ningún cubo solo pasa de 6 sobre 12, así que hacen falta dos.
    expect(result.typical.count).toBe(8);
    expect(result.typical.fromUsd).toBe(200);
    expect(result.typical.toUsd).toBe(380);
  });

  it("con un solo cubo la franja es el histograma entero, y sigue siendo cierta", () => {
    const result = drawn([bucket(12, 350, 640)]);

    expect(result.bars).toHaveLength(1);
    expect(result.typical).toEqual({ fromUsd: 350, toUsd: 640, count: 12 });
  });
});

describe("dónde queda el precio de quien publica (18.9)", () => {
  const band = { fromUsd: 402, toUsd: 598, count: 17 } as const;

  it("adentro de la franja es «en el medio», que es lo que dice la lámina", () => {
    expect(pricePositionInBand(band, 520)).toBe("within");
  });

  it("los dos bordes cuentan como adentro: el que pide 402 pide lo que la mayoría", () => {
    expect(pricePositionInBand(band, 402)).toBe("within");
    expect(pricePositionInBand(band, 598)).toBe("within");
  });

  it("un dólar por debajo ya es por debajo, y uno por encima ya es por encima", () => {
    expect(pricePositionInBand(band, 401)).toBe("below");
    expect(pricePositionInBand(band, 599)).toBe("above");
  });

  it("es la franja de la mayoría y no el eje entero lo que decide", () => {
    const result = drawn(concentrated);

    // $300 está adentro del eje ($200–$1000) y por debajo de lo que pide la
    // mayoría: contra el eje diría «en el medio» a quien regala el apartamento.
    expect(result.lowestUsd).toBeLessThan(300);
    expect(pricePositionInBand(result.typical, 300)).toBe("below");
  });

  it("un precio que no es un número no se ubica en ningún lado", () => {
    expect(pricePositionInBand(band, Number.NaN)).toBe(null);
  });
});
