import sharp from "sharp";
import {
  computeDHashFromGrayscalePixels,
  DHASH_GRID_HEIGHT,
  DHASH_GRID_WIDTH,
} from "../domain/dhash";
import type { PerceptualHash } from "../domain/perceptual-hash";

/**
 * design.md D4 — "sharp normalizes each upload to a 9x8 grayscale buffer".
 * The ONLY file in listing-trust/ that imports `sharp`. Screaming
 * architecture keeps this external, replaceable dependency in
 * infrastructure/ — swap the decoder and domain/dhash.ts (the algorithm)
 * doesn't change, since it never imports sharp.
 *
 * Resize to the fixed 9x8 grid (`fit: "fill"` — dHash deliberately
 * distorts aspect ratio rather than cropping, so the whole frame
 * contributes), flatten to one grayscale channel, hand raw bytes to the
 * pure domain function.
 */
export async function computeDHash(imageBuffer: Buffer): Promise<PerceptualHash> {
  const { data, info } = await sharp(imageBuffer)
    .resize(DHASH_GRID_WIDTH, DHASH_GRID_HEIGHT, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 1) {
    throw new Error(
      `Expected 1 grayscale channel from sharp, got ${info.channels} — a sharp API/` +
        "normalization regression, not bad input data.",
    );
  }

  return computeDHashFromGrayscalePixels(data);
}
