import { type PerceptualHash, toPerceptualHash } from "./perceptual-hash";

/** design.md D4 — 9x8 grid: 8 rows x 8 left/right comparisons = 64 bits. */
export const DHASH_GRID_WIDTH = 9;
export const DHASH_GRID_HEIGHT = 8;
const EXPECTED_PIXEL_COUNT = DHASH_GRID_WIDTH * DHASH_GRID_HEIGHT;

export class InvalidPixelGridError extends Error {
  constructor(actual: number) {
    super(
      `dHash expects exactly ${EXPECTED_PIXEL_COUNT} grayscale pixels ` +
        `(a ${DHASH_GRID_WIDTH}x${DHASH_GRID_HEIGHT} grid), got ${actual}.`,
    );
    this.name = "InvalidPixelGridError";
  }
}

/**
 * The pure half of D4's dHash. Deliberately does NOT import `sharp`.
 *
 * Screaming architecture keeps an external, replaceable dependency in
 * infrastructure/ (design.md, Technical Approach) — decoding an upload
 * with a native codec is exactly that, so it lives in
 * infrastructure/sharp-dhash.ts. Comparing 72 already-normalized bytes
 * pairwise into 64 bits has no I/O and no external library, is trivially
 * testable with a synthetic array, and IS D4's real algorithmic invariant.
 *
 * `pixels`: row-major, one byte (0-255) per pixel, length exactly
 * DHASH_GRID_WIDTH * DHASH_GRID_HEIGHT — producing that shape from an
 * arbitrary image is the adapter's job.
 *
 * Bit convention: 1 when a pixel is dimmer than its right neighbour.
 * Either convention is consistent as long as it's applied uniformly
 * everywhere — guaranteed, since this is the only function that produces
 * a PerceptualHash from pixels.
 *
 * Cryptographic hashing is explicitly not used (D4): it changes
 * completely for a re-encoded or resized copy of the same photo, the
 * exact scam pattern this defends against. dHash encodes only relative
 * brightness between adjacent pixels, which survives a re-encode/resize.
 */
export function computeDHashFromGrayscalePixels(pixels: ArrayLike<number>): PerceptualHash {
  if (pixels.length !== EXPECTED_PIXEL_COUNT) {
    throw new InvalidPixelGridError(pixels.length);
  }

  let hash = 0n;

  for (let row = 0; row < DHASH_GRID_HEIGHT; row++) {
    const rowStart = row * DHASH_GRID_WIDTH;
    for (let col = 0; col < DHASH_GRID_WIDTH - 1; col++) {
      // Bounds guaranteed by the length check above — every rowStart+col
      // and rowStart+col+1 is < EXPECTED_PIXEL_COUNT for these loop ranges.
      const left = pixels[rowStart + col] as number;
      const right = pixels[rowStart + col + 1] as number;
      hash = (hash << 1n) | (left < right ? 1n : 0n);
    }
  }

  return toPerceptualHash(hash);
}
