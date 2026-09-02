import { RESULTS_PER_PAGE } from "./pagination";

/**
 * **El histograma de precios, y dónde queda el precio de quien publica.**
 *
 * Lo leen DOS pantallas: la lista de resultados, antes de que alguien elija un
 * rango (F5, tasks 14.12), y el paso 3 de publicar, para que quien pone precio
 * vea el mercado antes de inventar un número (tasks 18.9). Vive acá y no en
 * `listing-publication/` justamente porque publicar es el SEGUNDO consumidor:
 * dos histogramas —uno por módulo— serían dos formas de contar lo mismo que
 * terminan dando dos números distintos para la misma zona.
 *
 * **Acá no se deriva nada de una base de datos, y ésa es la decisión de
 * arquitectura del archivo.** Los extremos del eje son «lo más barato y lo más
 * caro que se encontró» y no una escala fija — el `$200` y el `$1000` de la
 * lámina son avisos reales. Pero repartir en cubos necesita los extremos y
 * conocer los extremos necesita los datos: pedirlos por separado serían DOS
 * viajes de red, y la 14.11 —el requisito más pesado del documento— se ganó
 * con uno solo. Así que entra ya repartido, y **lo que eso le exige al
 * adaptador** (la porción que todavía no existe) es un `PriceBucketTally` por
 * cubo en orden ascendente, con `count` entero y con `lowestUsd`/`highestUsd`
 * en todo cubo que tenga al menos un aviso. Nada más: el total, los extremos
 * y la franja se derivan acá, para que el mismo número no se pueda escribir
 * distinto en dos lugares. Postgres lo resuelve en una sola sentencia —un CTE
 * con `min`/`max` y otro con `width_bucket` encima—, así que el viaje sigue
 * siendo uno.
 *
 * **Lo que este archivo NO dice es el español.** Devuelve una posición —
 * `below` / `within` / `above` — y la frase «Tu precio está en el medio» la
 * escribe la pantalla: misma partición que `app/publicar/violation-copy.ts`
 * con los códigos del validador. (El `STEP_COPY` de `search-accordion.ts` no
 * es el mismo caso: ahí la copia es el rótulo fijo de un vocabulario cerrado,
 * acá es un juicio sobre datos.)
 */

/**
 * Los ocho cubos que hay que pedirle a la consulta.
 *
 * Tres de las cuatro láminas dibujan ocho barras; sólo Publicar Teléfono
 * dibuja seis. Se unifica en ocho, y no es preferencia: el número de cubos se
 * decide ANTES de la consulta, así que dos anchos serían dos consultas para la
 * misma pregunta. El ancho real es `tally.length` y no esta constante — quien
 * mande seis los dibuja, pero entonces la lámina angosta y la ancha dejan de
 * contar igual.
 */
export const PRICE_HISTOGRAM_BUCKETS = 8;

/**
 * Desde cuántos avisos se dibuja, derivado de la página y no escrito a mano.
 *
 * **Media página de resultados.** Un histograma sobre tres avisos es ruido
 * vestido de dato, y en el paso 3 de publicar le fija el precio a alguien con
 * la fuerza de dos vecinos. Con doce, la franja de la mayoría lleva al menos
 * siete avisos, así que ninguna descansa sobre uno solo. Sale de
 * `RESULTS_PER_PAGE` en vez de ser un `12` suelto por la misma razón que
 * `LAST_ROOM_STEP` sale de `ROOM_STEPS`. **Es una decisión de producto** y el
 * fundador puede moverla: subirla calla el histograma en las zonas chicas,
 * bajarla lo deja hablar sobre un puñado de avisos.
 */
export const MIN_LISTINGS_FOR_PRICE_HISTOGRAM = RESULTS_PER_PAGE / 2;

/** Un cubo tal como lo devuelve la consulta: cuántos, y entre qué precios reales. */
export interface PriceBucketTally {
  readonly count: number;
  /** Ausentes cuando el cubo está vacío: no hay ningún precio que nombrar. */
  readonly lowestUsd?: number;
  readonly highestUsd?: number;
}

/**
 * Una franja de precios con los avisos que lleva adentro.
 *
 * `fromUsd` y `toUsd` son **precios que alguien pidió de verdad**, no los
 * bordes calculados del cubo: la regla transversal 3 dice que todo conteo es
 * real, y un borde nominal ($375 de partir el eje en ocho) es un precio que no
 * existe en ningún aviso.
 */
export interface PriceBand {
  readonly fromUsd: number;
  readonly toUsd: number;
  readonly count: number;
}

/**
 * Una barra. `share` va de 0 a 1 **contra la barra más alta**, no contra el
 * total: las láminas dibujan una barra al 100 % y el resto más bajas, y contra
 * el total ocho cubos parejos darían ocho barras del 12 % — la distribución,
 * que es lo único que el dibujo tiene para decir, sería ilegible.
 */
export interface PriceBar {
  readonly count: number;
  readonly share: number;
}

/** Dónde queda un precio respecto de lo que pide la mayoría. La frase la pone la pantalla. */
export type PricePosition = "below" | "within" | "above";

/**
 * **«No alcanza» es un estado propio y no un histograma vacío.** Para una
 * pantalla los dos se ven igual —cero barras— y significan lo contrario: uno
 * es «no hay oferta acá» y el otro «hay tan poca que no me animo a resumirla».
 */
export type PriceHistogram =
  | { readonly kind: "insufficient"; readonly total: number }
  | {
      readonly kind: "distribution";
      readonly total: number;
      /** El aviso más barato que se encontró — el rótulo izquierdo del eje. */
      readonly lowestUsd: number;
      /** El más caro — el rótulo derecho. */
      readonly highestUsd: number;
      /** Una por cubo, en el mismo orden, **incluidos los vacíos**: el eje no se recorta. */
      readonly bars: readonly PriceBar[];
      /** Dónde está «la mayoría». */
      readonly typical: PriceBand;
    };

function isWholeCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * La franja que cubre un tramo de cubos, o `null` si alguno no sabe sus precios.
 *
 * **Comprobar y derivar son la MISMA operación acá, y no dos.** Un cubo que
 * dice tener avisos y no sabe entre qué precios están no se puede rotular, y
 * rotularlo con el vecino sería inventar el dato que falta: falla cerrado
 * (AGENTS.md §7). Los cubos vacíos de las puntas se saltan solos — el eje no
 * se recorta, pero su rótulo nombra un aviso real.
 */
function bandOver(buckets: readonly PriceBucketTally[]): PriceBand | null {
  let fromUsd: number | undefined;
  let toUsd: number | undefined;
  let count = 0;
  for (const bucket of buckets) {
    if (bucket.count === 0) continue;
    if (!Number.isFinite(bucket.lowestUsd) || !Number.isFinite(bucket.highestUsd)) return null;
    fromUsd ??= bucket.lowestUsd;
    toUsd = bucket.highestUsd;
    count += bucket.count;
  }
  if (fromUsd === undefined || toUsd === undefined) return null;
  return { fromUsd, toUsd, count };
}

/**
 * La franja más angosta que es mayoría de verdad.
 *
 * **«La mayoría» es más de la mitad y no la mitad justa**: 16 de 32 no es la
 * mayoría de nada, y decirlo sería el número que miente que la regla 3
 * prohíbe. Por eso `* 2 > total` y no `>=`.
 *
 * Gana la primera que alcanza yendo de angosta a ancha: dos cubos son igual de
 * ciertos que cuatro y dicen el doble. Entre dos del mismo ancho gana la que
 * lleva más avisos, y si eso empata, la más barata —desempate determinista, no
 * preferencia. Buscar por ancho creciente tiene un efecto que conviene
 * nombrar: la ganadora nunca empieza ni termina en un cubo vacío, porque
 * recortarlo daría una más angosta con el mismo conteo.
 *
 * **No devuelve «ninguna», y no hace falta que pueda**: el histograma entero
 * suma el total, y el total siempre es mayoría de sí mismo — una rama muerta
 * es una rama que ninguna prueba puede vigilar.
 */
function narrowestMajority(counts: readonly number[], total: number): [number, number] {
  const whole: [number, number] = [0, counts.length - 1];
  for (let width = 1; width < counts.length; width += 1) {
    let best: [number, number] | null = null;
    let bestCount = 0;
    for (let start = 0; start + width <= counts.length; start += 1) {
      let sum = 0;
      for (let index = start; index < start + width; index += 1) sum += counts[index] ?? 0;
      if (sum * 2 <= total) continue;
      if (best === null || sum > bestCount) {
        best = [start, start + width - 1];
        bestCount = sum;
      }
    }
    if (best !== null) return best;
  }
  return whole;
}

/**
 * El histograma, o la negativa a dibujarlo. `tally` viene en orden ascendente,
 * un elemento por cubo: no hay un segundo parámetro que pueda discrepar.
 */
export function priceHistogram(tally: readonly PriceBucketTally[]): PriceHistogram {
  if (!tally.every((bucket) => isWholeCount(bucket.count))) {
    return { kind: "insufficient", total: 0 };
  }

  const total = tally.reduce((sum, bucket) => sum + bucket.count, 0);

  // El eje se arma ANTES de mirar el piso, y ese orden es lo que hace que las
  // dos negativas se puedan probar por separado.
  const axis = bandOver(tally);
  if (axis === null || total < MIN_LISTINGS_FOR_PRICE_HISTOGRAM) {
    return { kind: "insufficient", total };
  }

  const counts = tally.map((bucket) => bucket.count);
  const tallest = Math.max(...counts);
  const bars = counts.map((count) => ({ count, share: count / tallest }));

  const [from, to] = narrowestMajority(counts, total);
  // Que el `null` acá sea inalcanzable —el eje ya se rotuló y la franja
  // ganadora siempre lleva avisos— es razón para negarse, no para rellenar con
  // el eje: un resumen inventado se lee igual que uno cierto, y esta frase
  // termina en la pantalla donde alguien pone precio.
  const typical = bandOver(tally.slice(from, to + 1));
  if (typical === null) return { kind: "insufficient", total };

  return {
    kind: "distribution",
    total,
    lowestUsd: axis.fromUsd,
    highestUsd: axis.toUsd,
    bars,
    typical,
  };
}

/**
 * Dónde queda un precio respecto de la franja de la mayoría.
 *
 * **Contra la franja y no contra el eje**, y ésa es la única decisión que
 * tiene: quien pide $300 donde el eje va de $200 a $1000 está adentro del eje
 * y muy por debajo de lo que pide la gente — comparar contra el eje le diría
 * «estás en el medio» a alguien que está regalando el apartamento.
 *
 * Los dos bordes son «adentro»: el aviso que fija `fromUsd` ES uno de los que
 * la franja cuenta. `null` cuando el precio no es un número, porque el paso 3
 * se dibuja mientras se escribe y a mitad de tipear no hay posición honesta.
 */
export function pricePositionInBand(band: PriceBand, priceUsd: number): PricePosition | null {
  if (!Number.isFinite(priceUsd)) return null;
  if (priceUsd < band.fromUsd) return "below";
  if (priceUsd > band.toUsd) return "above";
  return "within";
}
