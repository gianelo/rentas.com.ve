import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { hammingDistance } from "../domain/hamming-distance";
import { computeDHash } from "./sharp-dhash";

const SIZE = 64;

/** Grayscale gradient PNG — generated, never a committed binary photo. */
async function gradientPng(direction: "horizontal" | "vertical"): Promise<Buffer> {
  const raw = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const ratio = direction === "horizontal" ? x : y;
      const v = Math.round((ratio / (SIZE - 1)) * 255);
      const idx = (y * SIZE + x) * 3;
      raw[idx] = v;
      raw[idx + 1] = v;
      raw[idx + 2] = v;
    }
  }
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png()
    .toBuffer();
}

describe("computeDHash (real sharp images, generated fixtures — no committed binary photos)", () => {
  // The scenario D4 exists for: a re-encoded copy of the same photo
  // (different format, different bytes) must still match. Measured
  // distance for this fixture: 0. See the calibration harness for how
  // real, noisier photographs behave — this synthetic gradient is highly
  // regular and does not stress the boundary near the threshold.
  it("hashes a JPEG re-encode of the same image within the design's proposed threshold", async () => {
    const original = await gradientPng("horizontal");
    const reencoded = await sharp(original).jpeg({ quality: 50 }).toBuffer();

    const distance = hammingDistance(await computeDHash(original), await computeDHash(reencoded));
    expect(distance).toBeLessThanOrEqual(8); // design.md D4's proposed (uncalibrated) threshold
  });

  // A genuinely different photo must NOT collide — proves the threshold
  // isn't trivially satisfied by everything. Measured distance: 64.
  it("hashes a horizontal gradient far apart from a vertical gradient of the same size", async () => {
    const horizontal = await computeDHash(await gradientPng("horizontal"));
    const vertical = await computeDHash(await gradientPng("vertical"));
    expect(hammingDistance(horizontal, vertical)).toBeGreaterThan(8);
  });
});
