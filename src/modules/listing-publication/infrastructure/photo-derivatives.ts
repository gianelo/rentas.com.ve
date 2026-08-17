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
export const THUMBNAIL_WIDTH = 128;
export const THUMBNAIL_HEIGHT = 96;

/** D12: "a card thumbnail and a ~200 KB detail image per photo". */
export const THUMBNAIL_MAX_BYTES = 10 * 1024;
export const DETAIL_MAX_BYTES = 200 * 1024;

/**
 * The detail photo renders at 640 × 360 on desktop (SISTEMA.md screen 2), so
 * 1280 is that at 2×. Applied to the LONGEST edge with the aspect ratio
 * preserved rather than as a 1280 × 720 crop: a portrait photograph forced
 * into a landscape box loses half the room. **This number is chosen here**,
 * as D12 states a byte budget for the detail image but no dimension.
 */
export const DETAIL_MAX_EDGE = 1280;

/**
 * A decompression bomb is a few KB on the wire and gigabytes decoded, so the
 * byte-length check in `inspectUploadedPhoto` cannot see it — this is the
 * pixel-dimension half promised there and landed here, where the decoder
 * exists. 40 MP clears any phone camera (a 12 MP photo is 4032 × 3024) while
 * refusing the images that exist only to exhaust a serverless function's
 * fixed memory ceiling.
 */
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * WebP for both derivatives. At the same perceptual quality it is
 * substantially smaller than JPEG, and every byte saved here is spent twice:
 * once against the search page's transfer budget, which loads many
 * thumbnails, and once against the 10 GB storage ceiling that decides how
 * many listings the free tier holds.
 */
const INITIAL_QUALITY = 80;
const MIN_QUALITY = 40;
const QUALITY_STEP = 10;

/**
 * When quality alone cannot reach the budget, the longest edge steps down
 * too. **This ladder exists because the first implementation threw instead,
 * and the noise fixtures proved that was reachable**: a maximally-detailed
 * 1280-edge image lands at ~209 KB even at quality 40, over the 200 KB
 * ceiling.
 *
 * Throwing was the wrong answer to that. Refusing a publisher's upload
 * because their photograph carried too much detail is a broken product —
 * and the photos most likely to be dense are the ones taken outdoors in
 * daylight, which is most of a rental listing. Fewer pixels at decent
 * quality also beats the same pixels at bad quality: WebP artefacts on a
 * room photo read as dirt on the walls.
 */
const DETAIL_EDGE_LADDER = [1280, 1024, 800] as const;

export interface Derivative {
  readonly bytes: Buffer;
  readonly byteLength: number;
}

export interface PhotoDerivatives {
  readonly thumbnail: Derivative;
  readonly detail: Derivative;
}

/**
 * Encodes at descending quality until the result fits its budget.
 *
 * The budget is met **by construction rather than asserted afterwards**, and
 * that distinction is the whole point. A single fixed quality either wastes
 * bytes on the average photo or blows the ceiling on a noisy one, and the
 * only way to find out which is to measure in production — where the
 * consequence is a page that misses its transfer budget for the visitors on
 * the worst connections, who are exactly the ones the budget exists for.
 *
 * If even the floor quality cannot fit, this throws rather than returning an
 * over-budget image. Silently exceeding a budget is how a budget stops
 * meaning anything.
 */
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

  // Fails fast on a bomb or on bytes that are not an image at all, before
  // either resize pipeline runs.
  await decoded.metadata();

  const thumbnail = await encodeWithinBudget(
    decoded.clone().resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: "cover" }),
    THUMBNAIL_MAX_BYTES,
  );

  if (!thumbnail) {
    // 128 × 96 is 12,288 pixels against a 10 KB ceiling. If even quality 40
    // cannot fit that, the assumption behind the budget is wrong and a
    // louder failure is the correct outcome — unlike the detail image,
    // there is no smaller size left to fall back to.
    throw new Error(
      `photo-derivatives: thumbnail could not be encoded within ${THUMBNAIL_MAX_BYTES} bytes ` +
        `at ${THUMBNAIL_WIDTH}×${THUMBNAIL_HEIGHT}. Refusing to return an over-budget derivative.`,
    );
  }

  for (const maxEdge of DETAIL_EDGE_LADDER) {
    const detail = await encodeWithinBudget(
      decoded.clone().resize(maxEdge, maxEdge, {
        fit: "inside",
        // Upscaling invents pixels and costs bytes for no added detail.
        withoutEnlargement: true,
      }),
      DETAIL_MAX_BYTES,
    );

    // Exactly two members, and the source is not one of them (task 3.10).
    if (detail) return { thumbnail, detail };
  }

  throw new Error(
    `photo-derivatives: detail could not be encoded within ${DETAIL_MAX_BYTES} bytes ` +
      `at any size down to ${DETAIL_EDGE_LADDER[DETAIL_EDGE_LADDER.length - 1]}px. ` +
      "Refusing to return an over-budget derivative.",
  );
}
