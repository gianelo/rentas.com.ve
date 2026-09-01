import { type PriceBucketTally, priceHistogram } from "./price-histogram";
import type { SearchSelection } from "./search-accordion";

/**
 * **El histograma de precios tal como lo dibuja el panel** (F5, tasks 14.12).
 *
 * `price-histogram.ts` contesta cómo se reparte la oferta. Este archivo
 * contesta las tres cosas que la PANTALLA necesita y que ninguna pantalla
 * puede decidir: qué barras quedan dentro del rango elegido, cómo se llama el
 * lugar del que habla la frase, y qué se dice cuando no alcanzan los avisos.
 * Las tres son reglas sobre datos, así que viven acá y no en el JSX — el suelo
 * de cobertura llega a `domain/` y no llega a `components/`.
 *
 * **La barra partida por el borde, y la contradicción de las láminas.** Las dos
 * de Lista dibujan ocho barras sobre un eje de `$200`–`$1000` —$100 por cubo—
 * con el rango en `$250`–`$700`. El cubo 1 ($200–$300) lleva el mínimo adentro
 * y va en `--tint`, afuera; el cubo 6 ($700–$800) apenas ROZA el máximo en su
 * primer punto y va en `--accent`, adentro. Una sola regla explica las ocho
 * barras —«el borde izquierdo del cubo cae en el rango»— y lo que significa es
 * asimétrico: abajo exige el cubo entero, arriba se conforma con tocarlo. La
 * barra con la MITAD del ancho adentro se dibuja afuera, y la que no tiene ni
 * un dólar adentro se dibuja adentro. Queda anotado en la 14.12.
 *
 * **Acá se decide con los precios reales y no con el borde nominal**, y eso
 * disuelve la contradicción en vez de elegir uno de sus dos lados: los cubos
 * traen el `lowestUsd` y el `highestUsd` de los avisos que cayeron adentro
 * (regla transversal 3), así que no hay que adivinar qué pasa «a caballo del
 * borde». Misma comparación en las dos puntas, y la garantía corre para un solo
 * lado: una barra marcada AFUERA no tiene un solo aviso que el rango admita,
 * mientras que una marcada adentro tiene precios que ALCANZAN el rango sin que
 * dos extremos puedan probar que hay uno en el medio. Ése es el sentido
 * correcto (AGENTS.md §7): lo seguro es la negativa, y la negativa es justo la
 * que escondería oferta que la búsqueda ya está entregando.
 */

/** Dentro o fuera del rango elegido. Es lo que la lámina pinta con dos colores. */
export type PriceBarPlacement = "within" | "outside";

export interface PriceHistogramBar {
  /**
   * El alto contra la barra más alta, en porciento entero. **Es dato y va
   * inline**: `SISTEMA.md` prohíbe que un componente escriba un color, un
   * radio o un tamaño, y ocho alturas medidas no son ninguna de las tres.
   */
  readonly heightPercent: number;
  readonly placement: PriceBarPlacement;
}

export type PriceHistogramView =
  | {
      readonly kind: "insufficient";
      /** Qué se lee en lugar del dibujo, con el total real adentro. */
      readonly notice: string;
    }
  | {
      readonly kind: "distribution";
      readonly bars: readonly PriceHistogramBar[];
      /** Los dos rótulos del eje: el aviso más barato y el más caro. */
      readonly fromLabel: string;
      readonly toLabel: string;
      /**
       * El dibujo dicho en palabras, para quien no lo ve. Una fila de barras es
       * una imagen de datos, y la marca de dentro/fuera va en color — que es
       * exactamente lo que `violation-copy.ts` llama «invisible para quien no
       * distingue colores y para el modo de alto contraste».
       */
      readonly caption: string;
      /** «En Chacao y Altamira, la mayoría está entre $380 y $620.» */
      readonly summary: string | null;
    };

function money(usd: number): string {
  return `$${usd}`;
}

/**
 * Si algún precio real de este cubo entra en el rango elegido.
 *
 * Un cubo vacío contesta que no: no tiene con qué estar adentro. Un cubo que
 * dice tener avisos sin saber a qué precio también contesta que no, por la
 * misma razón que el dominio se niega a rotularlo — inventarle una posición
 * sería el dato que falta escrito como si estuviera.
 */
function placeBucket(bucket: PriceBucketTally, selection: SearchSelection): PriceBarPlacement {
  const { lowestUsd, highestUsd } = bucket;
  if (bucket.count === 0 || lowestUsd === undefined || highestUsd === undefined) return "outside";
  if (selection.minPriceUsd !== undefined && highestUsd < selection.minPriceUsd) return "outside";
  if (selection.maxPriceUsd !== undefined && lowestUsd > selection.maxPriceUsd) return "outside";
  return "within";
}

/**
 * Los nombres unidos como se leen en una frase: «Chacao y Altamira».
 *
 * **No es `searchHeadline`, y la diferencia importa**: aquél es el rótulo
 * terso de al lado de la pastilla y une con comas; esto es prosa, y la lámina
 * escribe «y». `null` cuando no queda ningún nombre — de ahí sale que la
 * frase entera se calle en vez de servir «En , la mayoría…».
 */
function joinPlaces(names: readonly string[]): string | null {
  const named = names.map((name) => name.trim()).filter((name) => name.length > 0);
  if (named.length === 0) return null;
  if (named.length === 1) return named[0] ?? null;
  return `${named.slice(0, -1).join(", ")} y ${named[named.length - 1]}`;
}

/**
 * De qué lugar habla la frase: las zonas elegidas, y la ciudad entera si no
 * hay ninguna. **Vacío significa «toda la ciudad», nunca «ninguna»** — es la
 * misma lectura de `SearchSelection.zoneNames` que ya hace el acordeón.
 */
function scopeOf(selection: SearchSelection): string | null {
  return joinPlaces(selection.zoneNames) ?? joinPlaces([selection.cityName]);
}

/**
 * Lo que se lee por debajo del piso de doce.
 *
 * **Nombra el total real**, que es para lo que el dominio se lo guarda: cero
 * avisos y siete avisos dan las dos el mismo cero de barras y significan lo
 * contrario —«acá no hay oferta» y «hay tan poca que no me animo a resumirla»—,
 * así que se dicen distinto o la pantalla los confunde.
 */
function shortfallNotice(total: number): string {
  if (total === 0) return "Sin avisos todavía no hay precios que repartir.";
  const avisos = total === 1 ? "1 aviso" : `${total} avisos`;
  return `Con ${avisos} no alcanza para mostrar cómo se reparten los precios.`;
}

export function buildPriceHistogramView(
  tally: readonly PriceBucketTally[],
  selection: SearchSelection,
): PriceHistogramView {
  const histogram = priceHistogram(tally);
  if (histogram.kind === "insufficient") {
    return { kind: "insufficient", notice: shortfallNotice(histogram.total) };
  }

  const bars = histogram.bars.map((bar, index) => ({
    heightPercent: Math.round(bar.share * 100),
    placement: placeBucket(tally[index] ?? { count: 0 }, selection),
  }));

  const fromLabel = money(histogram.lowestUsd);
  const toLabel = money(histogram.highestUsd);
  const chosen = selection.minPriceUsd !== undefined || selection.maxPriceUsd !== undefined;
  const within = bars.filter((bar) => bar.placement === "within").length;
  const scope = scopeOf(selection);

  return {
    kind: "distribution",
    bars,
    fromLabel,
    toLabel,
    caption: chosen
      ? `Precios de ${fromLabel} a ${toLabel} en ${bars.length} barras: ${within} dentro del rango elegido y ${bars.length - within} afuera.`
      : `Precios de ${fromLabel} a ${toLabel} en ${bars.length} barras. Todavía no hay precio puesto.`,
    summary:
      scope === null
        ? null
        : `En ${scope}, la mayoría está entre ${money(histogram.typical.fromUsd)} y ${money(histogram.typical.toUsd)}.`,
  };
}
