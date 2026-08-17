import { describe, expect, it } from "vitest";
import {
  InvalidPerceptualHashError,
  PERCEPTUAL_HASH_BITS,
  toPerceptualHash,
} from "./perceptual-hash";

describe("toPerceptualHash", () => {
  it("accepts 0n, the minimum 64-bit unsigned value", () => {
    expect(toPerceptualHash(0n)).toBe(0n);
  });

  it("accepts the maximum 64-bit unsigned value", () => {
    const max = (1n << BigInt(PERCEPTUAL_HASH_BITS)) - 1n;
    expect(toPerceptualHash(max)).toBe(max);
  });

  it("rejects a negative value", () => {
    expect(() => toPerceptualHash(-1n)).toThrow(InvalidPerceptualHashError);
  });

  it("rejects a value that overflows 64 bits", () => {
    const overflow = 1n << BigInt(PERCEPTUAL_HASH_BITS);
    expect(() => toPerceptualHash(overflow)).toThrow(InvalidPerceptualHashError);
  });
});
