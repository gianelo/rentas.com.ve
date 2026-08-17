/**
 * Turning uploaded bytes into the two display derivatives (design.md D12).
 *
 * The implementation is `deriveListingPhoto` — `sharp`, so a native binary, a
 * decoder and a real CPU cost. The port exists so the publish pipeline can be
 * proven without any of that: the rules this application enforces AROUND
 * derivation (the original is discarded, the source never reaches storage, a
 * rejected file is never decoded) are ours, while the encoder's byte budgets
 * are already proven against real noise fixtures in
 * photo-derivatives.test.ts. Asserting those again here would test `sharp`.
 *
 * A function type rather than a one-method interface: one operation, no
 * state, so an object would only add a name the caller has to invent.
 */

export interface DerivedImage {
  readonly bytes: Uint8Array;
  readonly byteLength: number;
}

/**
 * Exactly two members, and the source is not one of them (task 3.10). The
 * shape is the guarantee: no field exists for handing the original back.
 */
export interface DerivedPhotoSet {
  readonly thumbnail: DerivedImage;
  readonly detail: DerivedImage;
}

export type PhotoDerivationPort = (source: Uint8Array) => Promise<DerivedPhotoSet>;
