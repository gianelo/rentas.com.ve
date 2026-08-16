import { describe, expect, it } from "vitest";
import { computeDHashFromGrayscalePixels, DHASH_GRID_WIDTH, InvalidPixelGridError } from "./dhash";
import { hammingDistance } from "./hamming-distance";

const ALL_64_BITS_SET = (1n << 64n) - 1n;

/** Repeats one row of 9 grayscale values across all 8 grid rows. */
function grid(row: number[]): number[] {
  if (row.length !== DHASH_GRID_WIDTH) throw new Error("fixture row must have 9 values");
  return Array(8).fill(row).flat();
}

const ASCENDING_ROW = [0, 20, 40, 60, 80, 100, 120, 140, 160];
// Same order as ASCENDING_ROW, shifted brighter by +50 (no clipping) —
// stands in for a re-encode/exposure-shifted copy of the same pixels.
const SHIFTED_ASCENDING_ROW = ASCENDING_ROW.map((v) => v + 50);

describe("computeDHashFromGrayscalePixels", () => {
  // Solid colour: no comparison is strictly "dimmer than its right
  // neighbour" — also documents a real limitation: an unrelated, equally
  // uniform photo hashes the same.
  it("hashes a solid-colour grid to all zero bits", () => {
    expect(computeDHashFromGrayscalePixels(grid(Array(9).fill(128)))).toBe(0n);
  });

  it("hashes a strictly ascending gradient to all one bits", () => {
    expect(computeDHashFromGrayscalePixels(grid(ASCENDING_ROW))).toBe(ALL_64_BITS_SET);
  });

  // The property D4 depends on: a uniform brightness shift must not
  // change the hash, because only relative order matters.
  it("is invariant to a uniform brightness shift that does not change pixel order", () => {
    const original = computeDHashFromGrayscalePixels(grid(ASCENDING_ROW));
    const shifted = computeDHashFromGrayscalePixels(grid(SHIFTED_ASCENDING_ROW));
    expect(hammingDistance(original, shifted)).toBe(0);
  });

  it("rejects a pixel array of the wrong length", () => {
    expect(() => computeDHashFromGrayscalePixels([1, 2, 3])).toThrow(InvalidPixelGridError);
  });
});
