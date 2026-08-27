/**
 * Object storage for listing photos. Defined in the application layer and
 * implemented in infrastructure (Cloudflare R2, task 3.7) — the use case
 * must not know that R2 exists, and every method here is named for what
 * publication needs rather than for what S3 offers.
 *
 * The shape encodes design.md's security requirements rather than leaving
 * them to the adapter's discretion, because a security property that lives
 * in an implementation is a security property the next implementation can
 * quietly drop.
 */

/**
 * A server-derived object key. **The client never supplies one.**
 * design.md's security table: "Key derived server-side with a per-account
 * prefix; short TTL; content-length-range; fixed content-type. RED test:
 * client-supplied key rejected."
 *
 * A caller cannot construct this type from a string it received over the
 * wire, because `createUploadTarget` is the only thing that returns one.
 * That is the point: it makes "the client chose where its bytes land"
 * unrepresentable instead of merely discouraged.
 */
export interface UploadTarget {
  /** Where the object will live. Derived from the publisher's own id. */
  readonly key: string;
  /** Short-lived presigned PUT. */
  readonly url: string;
  /** When the URL stops working, so a caller can surface it honestly. */
  readonly expiresAt: Date;
}

export interface CreateUploadTargetRequest {
  /**
   * The authenticated publisher. Becomes the key's prefix, which is what
   * makes one account's presigned URL useless for writing into another's
   * space even if it leaks.
   */
  readonly publisherId: string;
  /**
   * Pinned into the signature. A URL signed for `image/jpeg` cannot be
   * replayed to upload something else.
   */
  readonly contentType: string;
  /**
   * Signed as a `content-length-range`, so R2 refuses an oversized body
   * before a byte reaches this application. This is the enforcement point
   * that `inspectUploadedPhoto`'s own ceiling deliberately duplicates —
   * the two must move together.
   */
  readonly maxBytes: number;
  /**
   * El tamaño exacto que el navegador ya midió, cuando lo sabe. Sube el techo
   * de byte de una comprobación posterior a una restricción FIRMADA: R2 refusa
   * un cuerpo de cualquier otro largo en su propio borde.
   *
   * **Opcional, y aditivo** — un llamador que no lo sabe sigue obteniendo una
   * firma válida contra `maxBytes`. Vive en el puerto y no sólo en el
   * adaptador (donde estaba, como `CreateUploadTargetInput`) desde la 9.28,
   * porque el caso de uso que firma la subida de un borrador lo necesita y no
   * puede importar infraestructura para pedirlo.
   */
  readonly byteLength?: number;
}

export interface StoredObject {
  readonly key: string;
  readonly byteLength: number;
}

export interface PhotoStoragePort {
  /**
   * Issues a presigned PUT into the publisher's own temporary prefix.
   * Nothing about the destination comes from the caller's input beyond the
   * publisher id, which the session already established.
   */
  createUploadTarget(request: CreateUploadTargetRequest): Promise<UploadTarget>;

  /**
   * Reads an uploaded object back so it can be inspected, hashed and
   * derived. Returns the raw bytes; deciding whether they are acceptable
   * belongs to `inspectUploadedPhoto`, not here.
   */
  read(key: string): Promise<Uint8Array>;

  /** Stores a generated derivative under a permanent key. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>;

  /**
   * Deletes an object. **This is not housekeeping — it is D12.** "Originals
   * are discarded after hashing and normalization." Keeping them caps the
   * catalogue at ~330 listings against R2's free tier instead of ~7,000, so
   * the delete is a product requirement with a number attached, and a
   * failure to delete must be loud rather than swallowed.
   */
  remove(key: string): Promise<void>;
}
