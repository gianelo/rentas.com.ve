import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  DETAIL_MAX_BYTES,
  DETAIL_MAX_EDGE,
  deriveListingPhoto,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_MAX_BYTES,
  THUMBNAIL_WIDTH,
} from "./photo-derivatives";

/**
 * Tasks 3.10–3.12, design.md D12.
 *
 * **The fixtures are noise on purpose, and this is the single most important
 * decision in this file.** A solid-colour test image compresses to almost
 * nothing, so a byte budget asserted against one passes no matter how badly
 * the encoder is configured — it would be a gate that cannot fail, which is
 * the exact failure this project has already shipped five times. Random
 * pixels are close to incompressible, so they are the worst case a real
 * photograph can approach, and a budget that holds against them holds
 * against anything a phone produces.
 */

/** Incompressible source material, generated rather than committed. */
async function noiseImage(width: number, height: number): Promise<Buffer> {
  const channels = 3;
  const pixels = Buffer.allocUnsafe(width * height * channels);
  // Deterministic, so a failure is reproducible. A seeded LCG rather than
  // Math.random: an intermittently-failing budget test is worse than none.
  let seed = 0x2545f491;
  for (let index = 0; index < pixels.length; index += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    pixels[index] = seed & 0xff;
  }
  return sharp(pixels, { raw: { width, height, channels } }).jpeg({ quality: 100 }).toBuffer();
}

async function dimensionsOf(bytes: Buffer): Promise<{ width: number; height: number }> {
  const { width, height } = await sharp(bytes).metadata();
  return { width: width ?? 0, height: height ?? 0 };
}

describe("deriveListingPhoto", () => {
  const SOURCES = [
    ["landscape", 1600, 900],
    ["portrait", 900, 1600],
    ["oversized", 4032, 3024], // a real 12-megapixel phone photo
  ] as const;

  describe.each(SOURCES)("a %s source", (_label, width, height) => {
    it("emits a thumbnail at exactly the row's derivative size", async () => {
      // 128 × 96 covers the 44 × 34 mobile row and the 64 × 48 desktop row
      // at 2× device pixel ratio (D12/D14). Exact, not "at most": the row
      // is a fixed box, so the derivative crops to fill it rather than
      // letterboxing inside it.
      const { thumbnail } = await deriveListingPhoto(await noiseImage(width, height));

      expect(await dimensionsOf(thumbnail.bytes)).toEqual({
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
      });
    });

    it("keeps the thumbnail inside its byte budget", async () => {
      const { thumbnail } = await deriveListingPhoto(await noiseImage(width, height));

      expect(thumbnail.byteLength).toBeLessThanOrEqual(THUMBNAIL_MAX_BYTES);
      expect(thumbnail.byteLength).toBe(thumbnail.bytes.byteLength);
    });

    it("bounds the detail image's longest edge without distorting it", async () => {
      const source = await noiseImage(width, height);
      const { detail } = await deriveListingPhoto(source);
      const derived = await dimensionsOf(detail.bytes);

      expect(Math.max(derived.width, derived.height)).toBeLessThanOrEqual(DETAIL_MAX_EDGE);

      // Aspect ratio survives to within a pixel of rounding. Cropping a
      // portrait photograph to a landscape box would cut a room in half.
      expect(derived.width / derived.height).toBeCloseTo(width / height, 1);
    });

    it("keeps the detail image inside its byte budget", async () => {
      const { detail } = await deriveListingPhoto(await noiseImage(width, height));

      expect(detail.byteLength).toBeLessThanOrEqual(DETAIL_MAX_BYTES);
    });
  });

  it("never enlarges a source smaller than the detail bound", async () => {
    // Upscaling invents pixels and costs bytes for no added detail. A small
    // photo stays small.
    const { detail } = await deriveListingPhoto(await noiseImage(400, 300));

    expect(await dimensionsOf(detail.bytes)).toEqual({ width: 400, height: 300 });
  });

  /**
   * Task 3.10. The derivation step cannot hand the original onward: its
   * return type has exactly two members, and neither is the source.
   *
   * This is a structural guarantee, not the whole of D12 — the storage
   * adapter (3.7) must still refuse to PUT the buffer it was given. What
   * this proves is that nothing downstream can retain the original *by
   * receiving it from here*, which is the half this layer can enforce.
   */
  it("returns only derivatives — the original is not among them", async () => {
    const source = await noiseImage(1600, 900);
    const result = await deriveListingPhoto(source);

    expect(Object.keys(result).sort()).toEqual(["detail", "thumbnail"]);
    expect(result.detail.bytes.equals(source)).toBe(false);
    expect(result.thumbnail.bytes.equals(source)).toBe(false);
  });

  it("refuses a decompression bomb instead of trying to decode it", async () => {
    // The pixel-dimension half of the upload guard, promised in 3.6 and
    // landed here because it needs the decoder. A 100-megapixel PNG is a
    // few KB on the wire and gigabytes in memory — a byte-length check
    // cannot see it, and this runs on a serverless function with a fixed
    // memory ceiling.
    const bomb = await sharp({
      create: { width: 12_000, height: 12_000, channels: 3, background: "#000" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await expect(deriveListingPhoto(bomb)).rejects.toThrow(/pixel/i);
  });

  it("rejects bytes that are not a decodable image", async () => {
    await expect(deriveListingPhoto(Buffer.from("not an image at all"))).rejects.toThrow();
  });
});
