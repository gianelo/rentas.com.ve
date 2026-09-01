import {
  type PriceBand,
  type PriceBucketTally,
  priceHistogram,
  pricePositionInBand,
} from "./price-histogram";

/**
 * **El histograma tal como lo dibuja el paso 3 de publicar** (tasks.md 18.9).
 *
 * Hermano de `price-histogram-panel.ts` y vive al lado suyo a propósito:
 * `price-histogram.ts` es el único motor del repositorio y las DOS pantallas
 * que lo leen traducen su respuesta acá, donde llega el piso de cobertura.
 *
 * **La diferencia entre las dos no es de forma, es de pregunta.** En la lista
 * alguien YA eligió un rango y pregunta «¿qué cubre lo que pedí?»; acá no
 * eligió nada y pregunta «¿qué pide la gente?». Por eso el panel marca las
 * barras que el rango alcanza y esto marca la franja de la mayoría — y por eso
 * **el color no puede cargar el significado en ninguna de las dos**: las dos
 * ponen el dibujo en palabras y las dos escriben la frase debajo. Quien
 * aprendió «acento = mi rango» en la lista no puede traerlo acá, donde no hay
 * rango; lo que sí vale en las dos es «lo marcado contesta la pregunta que dice
 * el renglón de abajo».
 */

/** Marcada como «la mayoría», o el resto del eje. */
export type PriceStepBarBand = "typical" | "rest";

export interface PriceStepBar {
  /** Contra la barra más alta, en porciento entero. Dato medido: va inline. */
  readonly heightPercent: number;
  readonly band: PriceStepBarBand;
}

export type PriceStepHistogramView =
  | { readonly kind: "insufficient"; readonly notice: string }
  | {
      readonly kind: "distribution";
      /** «Precios en Chacao» — de qué zona hablan las barras. */
      readonly heading: string;
      readonly bars: readonly PriceStepBar[];
      readonly fromLabel: string;
      readonly toLabel: string;
      /** El dibujo dicho en palabras, para quien no ve el color. */
      readonly caption: string;
      /** «La mayoría pide entre $380 y $620. Tu precio está en el medio.» */
      readonly summary: string;
    };

export interface PriceStepInput {
  /** La zona del paso 2. Sin ella la página no consulta: no hay «acá». */
  readonly zoneName: string;
  /** El precio del borrador, ausente mientras nadie escribió uno válido. */
  readonly priceUsd?: number;
  /**
   * Lo tecleado que no sobrevivió al parseo, que es lo que el campo MUESTRA.
   * Cuando lo hay, `priceUsd` es el precio anterior: juzgarlo sería una frase
   * sobre un número que la pantalla ya reemplazó.
   */
  readonly retypedPrice?: string;
}

function money(usd: number): string {
  return `$${usd}`;
}

const POSITION_COPY = {
  below: " Tu precio está por debajo.",
  within: " Tu precio está en el medio.",
  above: " Tu precio está por encima.",
} as const;

function summaryOf(band: PriceBand, input: PriceStepInput): string {
  const majority = `La mayoría pide entre ${money(band.fromUsd)} y ${money(band.toUsd)}.`;
  // Lo tecleado gana; basura llega como `NaN` y `pricePositionInBand` contesta
  // `null`. Es la negativa del dominio, no una segunda escrita acá.
  const shown = input.retypedPrice === undefined ? input.priceUsd : Number(input.retypedPrice);
  const position = shown === undefined ? null : pricePositionInBand(band, shown);

  return position === null ? majority : `${majority}${POSITION_COPY[position]}`;
}

/**
 * Lo que se lee por debajo del piso de doce, **y no es lo que lee la lista**.
 *
 * Allá se explica por qué falta una decoración. Acá el riesgo es el contrario:
 * un histograma sobre tres vecinos le fijaría el precio a alguien con la fuerza
 * de tres números, así que la frase devuelve la decisión a quien publica en vez
 * de dejar un hueco donde había un dato.
 */
function shortfallNotice(total: number, zoneName: string): string {
  if (total === 0) return `Todavía no hay avisos en ${zoneName}: el precio lo ponés vos.`;
  const avisos = total === 1 ? "1 aviso" : `${total} avisos`;
  return `Con ${avisos} en ${zoneName} no alcanza para decir cuánto se pide: el precio lo ponés vos.`;
}

/**
 * Si este cubo es parte de la franja de la mayoría, **decidido con los precios
 * reales del cubo y no con el borde nominal** — misma decisión que la rebanada
 * C tomó para la barra partida por el borde (14.12). Los cubos son tramos
 * disjuntos y ascendentes, así que la comparación es exacta. Un cubo vacío no
 * está adentro de nada.
 */
function inBand(bucket: PriceBucketTally, band: PriceBand): boolean {
  const { lowestUsd, highestUsd } = bucket;
  if (bucket.count === 0 || lowestUsd === undefined || highestUsd === undefined) return false;
  return lowestUsd >= band.fromUsd && highestUsd <= band.toUsd;
}

export function buildPriceStepHistogramView(
  tally: readonly PriceBucketTally[],
  input: PriceStepInput,
): PriceStepHistogramView {
  const histogram = priceHistogram(tally);
  if (histogram.kind === "insufficient") {
    return { kind: "insufficient", notice: shortfallNotice(histogram.total, input.zoneName) };
  }

  const bars = histogram.bars.map((bar, index) => ({
    heightPercent: Math.round(bar.share * 100),
    band: inBand(tally[index] ?? { count: 0 }, histogram.typical)
      ? ("typical" as const)
      : ("rest" as const),
  }));

  const fromLabel = money(histogram.lowestUsd);
  const toLabel = money(histogram.highestUsd);
  const marked = bars.filter((bar) => bar.band === "typical").length;

  return {
    kind: "distribution",
    heading: `Precios en ${input.zoneName}`,
    bars,
    fromLabel,
    toLabel,
    caption: `Precios de ${fromLabel} a ${toLabel} en ${bars.length} barras: ${marked} marcan la franja donde se concentra la oferta.`,
    summary: summaryOf(histogram.typical, input),
  };
}
