import { describe, expect, it } from "vitest";
import { hammingDistance, KNOWN_HAMMING_DISTANCE_VECTORS } from "./hamming-distance";
import type { PerceptualHash } from "./perceptual-hash";

describe("hammingDistance", () => {
  it("is 0 for two identical hashes", () => {
    const h = 0x1234n as PerceptualHash;
    expect(hammingDistance(h, h)).toBe(0);
  });

  it("is 64 for complementary hashes (all bits differ)", () => {
    const zero = 0n as PerceptualHash;
    const allOnes = ((1n << 64n) - 1n) as PerceptualHash;
    expect(hammingDistance(zero, allOnes)).toBe(64);
  });

  it("is 1 for hashes differing by exactly one bit", () => {
    const a = 0b1010n as PerceptualHash;
    const b = 0b1011n as PerceptualHash;
    expect(hammingDistance(a, b)).toBe(1);
  });

  it.each(KNOWN_HAMMING_DISTANCE_VECTORS)(
    "matches the fixed cross-check vector: distance($a, $b) = $distance",
    ({ a, b, distance }) => {
      expect(hammingDistance(a, b)).toBe(distance);
      expect(hammingDistance(b, a)).toBe(distance); // symmetry
    },
  );
});
