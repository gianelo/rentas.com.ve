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

/** Las cinco derivadas, nombradas por la superficie que las usa. */
export type DerivativeName = "thumb" | "card" | "strip" | "detail" | "full";

/**
 * Cinco miembros, y la fuente no es ninguno (tarea 3.10). La forma ES la
 * garantía: no existe un campo por el cual devolver el original.
 */
export interface DerivedPhotoSet {
  /**
   * **Cinco, y cada una nombra la superficie que la usa.** Eran dos, y estaban
   * dimensionadas para el layout viejo -- la miniatura de una fila medía 44×34.
   * El diseño nuevo tiene cuatro superficies con anchos distintos más el visor,
   * y nombrarlas por su uso en vez de por su tamaño es lo que evita que alguien
   * elija "la de 256" para un lugar donde entra "la de 360".
   */
  readonly thumb: DerivedImage;
  readonly card: DerivedImage;
  readonly strip: DerivedImage;
  readonly detail: DerivedImage;
  readonly full: DerivedImage;
}

export type PhotoDerivationPort = (source: Uint8Array) => Promise<DerivedPhotoSet>;
