/**
 * design.md D4 — a PerceptualHash is the 64-bit value dhash.ts produces,
 * one bit per pairwise pixel comparison across a 9x8 grayscale grid.
 *
 * Representation: `bigint`, not a '0'/'1' string, not `number`. `number`
 * keeps only 53 exact integer bits (`MAX_SAFE_INTEGER`), so a 64-bit hash
 * would silently round — wrong when the value's whole meaning is its
 * bits. `bigint` is exact at 64 bits and gives native `^`/`&`/`|`, letting
 * hamming-distance.ts mirror Postgres's `hash # candidate` then
 * `bit_count(...)` structurally. It also casts onto `bit(64)` directly
 * (`$1::bit(64)`), no text round-trip — the Drizzle adapter (task 4.6, out
 * of scope here) has nothing left to transcode.
 *
 * Branded so an arbitrary bigint can't pass as a hash without going
 * through `toPerceptualHash`, the one place the 64-bit range is checked.
 */
export const PERCEPTUAL_HASH_BITS = 64;

const MAX_UNSIGNED_64_BIT = (1n << BigInt(PERCEPTUAL_HASH_BITS)) - 1n;

declare const perceptualHashBrand: unique symbol;

export type PerceptualHash = bigint & { readonly [perceptualHashBrand]: true };

export class InvalidPerceptualHashError extends Error {
  constructor(value: bigint) {
    super(`Perceptual hash must fit in ${PERCEPTUAL_HASH_BITS} unsigned bits, got ${value}.`);
    this.name = "InvalidPerceptualHashError";
  }
}

export function toPerceptualHash(value: bigint): PerceptualHash {
  if (value < 0n || value > MAX_UNSIGNED_64_BIT) {
    throw new InvalidPerceptualHashError(value);
  }
  return value as PerceptualHash;
}
