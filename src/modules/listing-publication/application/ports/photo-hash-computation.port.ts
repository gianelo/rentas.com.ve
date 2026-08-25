import type { PerceptualHash } from "../../../listing-trust/domain/perceptual-hash";

/**
 * Computing a submitted photo's perceptual hash (design.md D4, task 4.7).
 *
 * A function type, mirroring `PhotoDerivationPort`: the real implementation
 * (`computeDHash`, `listing-trust/infrastructure/sharp-dhash.ts`) is
 * `sharp` — a native decoder that has no business being imported into this
 * application layer, the same reasoning that keeps `derive` a port here
 * rather than a direct call. The port takes the same `Uint8Array` shape
 * `derive` already does, so the composition root is the only place a
 * `Buffer` conversion is ever mentioned.
 */
export type PhotoHashComputationPort = (source: Uint8Array) => Promise<PerceptualHash>;
