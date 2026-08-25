import type { PerceptualHash } from "./perceptual-hash";

/**
 * design.md D4 — production similarity is `bit_count(hash # candidate) <=
 * 8` in Postgres. This is the domain's own copy: XOR then popcount, same
 * two operations, same order, as the SQL expression.
 *
 * WHY THIS EXISTS EVEN THOUGH PRODUCTION NEVER CALLS IT: real similarity
 * search scans every stored hash in one Postgres query; a per-row
 * TypeScript loop can't replace that without loading the whole table
 * first. This exists so domain/ is testable with zero infrastructure, and
 * so it can hand a fixed set of vectors to a later integration test that
 * replays them against the real `bit_count` expression.
 *
 * THE REAL RISK, STATED PLAINLY: the identical logic now exists in two
 * places — here, and as a Postgres expression the 4.6 adapter will add.
 * Two implementations that silently drift are worse than one untested
 * implementation, because drift produces a confident wrong answer, not a
 * visible gap: this function could return one distance and a live search
 * return another for the same pair of hashes, unnoticed.
 *
 * WHAT WOULD KEEP THEM HONEST: task 4.6's adapter suite MUST run
 * `KNOWN_HAMMING_DISTANCE_VECTORS` (below) through a real
 * `SELECT bit_count($1::bit(64) # $2::bit(64))` and assert the same
 * distances this file's tests assert. That cross-check doesn't exist yet
 * — recorded here so it isn't forgotten once 4.1/4.6 land.
 */
export function hammingDistance(a: PerceptualHash, b: PerceptualHash): number {
  let xor = a ^ b;
  let distance = 0;

  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }

  return distance;
}

/**
 * design.md D4, Open Questions — `<= 8` is the PROPOSED hard-block
 * distance, explicitly NOT a measured one: "Needs calibration against real
 * Venezuelan listing photos before launch — too loose blocks honest
 * publishers, too tight lets re-encoded scams through." Task 4.7 wires this
 * number into the publish and photo-attachment paths; it does NOT resolve
 * that open question, and must not be read as having done so.
 *
 * One named owner here — rather than a literal `8` retyped at every call
 * site — is what keeps the provisional number greppable and keeps the next
 * person from mistaking repetition for calibration.
 */
export const MAX_DUPLICATE_HAMMING_DISTANCE = 8;

/** Fixed vectors for the cross-check above, independent of dhash.ts. */
export const KNOWN_HAMMING_DISTANCE_VECTORS: ReadonlyArray<{
  a: PerceptualHash;
  b: PerceptualHash;
  distance: number;
}> = [
  { a: 0n as PerceptualHash, b: 0n as PerceptualHash, distance: 0 },
  { a: 0n as PerceptualHash, b: ((1n << 64n) - 1n) as PerceptualHash, distance: 64 },
  { a: 0b1010n as PerceptualHash, b: 0b1011n as PerceptualHash, distance: 1 },
  {
    a: 0x5555555555555555n as PerceptualHash,
    b: 0xaaaaaaaaaaaaaaaan as PerceptualHash,
    distance: 64,
  },
];
