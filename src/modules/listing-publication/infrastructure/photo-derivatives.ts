import sharp from "sharp";

/**
 * Display derivatives, generated once at upload (design.md D12). The
 * platform's on-demand image optimizer is deliberately not used: it is a
 * metered resource on the free tier, while serving these from R2 costs zero
 * egress at any traffic level — and traffic is precisely what success looks
 * like.
 *
 * This module produces bytes and nothing else. Storing them is the R2
 * adapter's job (task 3.7), which keeps the whole budget question provable
 * without a bucket, a network, or a credential.
 */

/**
 * 128 × 96 covers the row thumbnail at 2× device pixel ratio on both
 * viewports — 44 × 34 CSS px on mobile and 64 × 48 on desktop under
 * `compacto` (D12/D14). One derivative, both screens.
 *
 * The row is a fixed box, so this is an exact size reached by cropping, not
 * a bound to letterbox inside. A thumbnail with bars would break the row's
 * measured 96px height ceiling by changing what the image occupies.
 */
const KB = 1024;

/**
 * **Cinco derivadas, y cada una nombra la superficie que la usa.** Las dos que
 * había se dimensionaron para el layout viejo, cuando la miniatura de una fila
 * medía 44×34; el diseño nuevo tiene cuatro superficies con anchos distintos.
 * Nombrarlas por su uso y no por su tamaño es lo que evita que alguien elija
 * "la de 256" para un lugar donde entra "la de 360" — el mismo error que
 * `tokens.css` ya registró cuando un título tomó el token del precio.
 *
 * **A 1x, y eso lo dice el diseño**: "En 4K tampoco se sirven fotos al doble de
 * densidad: chocaría con el presupuesto de bytes."
 */
export const DERIVATIVE_SPECS = {
  /** Tarjeta de la cuadrícula en móvil (158) y miniaturas del visor. */
  thumb: { width: 160, height: 120 },
  /** Tarjeta de la cuadrícula en escritorio (254). */
  card: { width: 256, height: 192 },
  /** Tira de la ficha en móvil (328×180). */
  strip: { width: 360, height: 200 },
  /** Foto principal de la ficha en escritorio. */
  detail: { width: 640, height: 360 },
} as const;

/**
 * El visor, acotado por su lado mayor porque conserva la proporción de la
 * fuente: es la única superficie que muestra la foto entera y no un recorte.
 *
 * **1024 y no 1280, por decisión del fundador (2026-08-22), y la razón está
 * medida.** Esta derivada es el 59% del peso de una foto, así que bajarla
 * devuelve 1.393 avisos de capacidad dentro de los 10 GB gratuitos de R2 —
 * más que cualquier otro recorte posible.
 */
export const FULL_MAX_EDGE = 1024;

/**
 * El techo de bytes de cada una. **Cambiar cualquiera de estos cinco números
 * cambia cuántos avisos entran en R2**, así que un test los suma y afirma el
 * total: 246 KB por foto, 1,44 MB por aviso de seis, ~7.100 avisos en el
 * tramo gratuito.
 */
export const DERIVATIVE_BUDGETS = {
  thumb: 8 * KB,
  card: 16 * KB,
  strip: 40 * KB,
  detail: 62 * KB,
  full: 120 * KB,
} as const;

export type DerivativeName = keyof typeof DERIVATIVE_BUDGETS;

/**
 * Se conservan porque el adaptador de R2 y el esquema todavía los nombran. La
 * mudanza de `listing_photo` a las cinco derivadas es su propia tarea.
 */
export const THUMBNAIL_WIDTH = DERIVATIVE_SPECS.thumb.width;
export const THUMBNAIL_HEIGHT = DERIVATIVE_SPECS.thumb.height;
export const THUMBNAIL_MAX_BYTES = DERIVATIVE_BUDGETS.thumb;
export const DETAIL_MAX_BYTES = DERIVATIVE_BUDGETS.full;
export const DETAIL_MAX_EDGE = FULL_MAX_EDGE;

const MAX_INPUT_PIXELS = 40_000_000;
const INITIAL_QUALITY = 80;
const MIN_QUALITY = 40;
const QUALITY_STEP = 10;

/**
 * La escalera de tamaños del visor. Si la calidad mínima no alcanza para
 * entrar en el presupuesto a 1024, se baja el tamaño antes que la calidad:
 * una foto más chica y nítida se lee mejor que una grande y sucia.
 */
const FULL_EDGE_LADDER = [FULL_MAX_EDGE, 800, 640] as const;

export interface Derivative {
  readonly bytes: Buffer;
  readonly byteLength: number;
}

export type PhotoDerivatives = Record<DerivativeName, Derivative>;

async function encodeWithinBudget(
  pipeline: sharp.Sharp,
  maxBytes: number,
): Promise<Derivative | null> {
  for (let quality = INITIAL_QUALITY; quality >= MIN_QUALITY; quality -= QUALITY_STEP) {
    // `clone()` because a sharp pipeline is consumed by `toBuffer()`, and
    // reusing a spent one silently yields the first encoding again — which
    // would make every retry a no-op that still appears to work.
    const bytes = await pipeline.clone().webp({ quality, effort: 4 }).toBuffer();
    if (bytes.byteLength <= maxBytes) {
      return { bytes, byteLength: bytes.byteLength };
    }
  }
  return null;
}

export async function deriveListingPhoto(source: Buffer): Promise<PhotoDerivatives> {
  const decoded = sharp(source, { limitInputPixels: MAX_INPUT_PIXELS });
  const metadata = await decoded.metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;

  const derivatives: Partial<PhotoDerivatives> = {};

  for (const [name, spec] of Object.entries(DERIVATIVE_SPECS)) {
    const derivative = await encodeWithinBudget(
      // `withoutEnlargement` porque agrandar inventa píxeles y gasta bytes en
      // ellos. Una foto de 300px no se estira a 640.
      decoded.clone().resize(spec.width, spec.height, { fit: "cover", withoutEnlargement: true }),
      DERIVATIVE_BUDGETS[name as keyof typeof DERIVATIVE_BUDGETS],
    );
    if (!derivative) {
      throw new Error(
        `photo-derivatives: "${name}" no entra en ${DERIVATIVE_BUDGETS[name as DerivativeName]} ` +
          `bytes a ${spec.width}×${spec.height} ni a la calidad mínima. Se niega a devolver una ` +
          "derivada fuera de presupuesto: el presupuesto es lo que hace que la página cargue.",
      );
    }
    derivatives[name as DerivativeName] = derivative;
  }

  for (const maxEdge of FULL_EDGE_LADDER) {
    const full = await encodeWithinBudget(
      decoded.clone().resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true }),
      DERIVATIVE_BUDGETS.full,
    );
    if (full) {
      return { ...(derivatives as PhotoDerivatives), full };
    }
  }

  throw new Error(
    `photo-derivatives: el visor no entra en ${DERIVATIVE_BUDGETS.full} bytes ni bajando a ` +
      `${FULL_EDGE_LADDER[FULL_EDGE_LADDER.length - 1]}px desde una fuente de ` +
      `${sourceWidth}×${sourceHeight}.`,
  );
}
