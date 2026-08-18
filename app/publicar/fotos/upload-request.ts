import { MAX_PHOTOS_PER_LISTING } from "../../../src/modules/listing-publication/domain/publishable-listing";
import {
  MAX_PHOTO_BYTES,
  SUPPORTED_PHOTO_CONTENT_TYPES,
} from "../../../src/modules/listing-publication/domain/uploaded-photo";

/**
 * What step 2 is allowed to ask for before a single signature is issued.
 *
 * A presigned PUT is a **write grant**. Everything the browser sends here is
 * a claim it makes about files this server has never seen, so the whole point
 * of this module is to decide what is worth signing — cheaply, and before the
 * R2 adapter or the network are involved.
 *
 * The adapter re-checks the content type and the declared size on every
 * single target it signs, and that duplication is deliberate: this layer
 * exists to give a publisher a sentence they can act on, that one exists so a
 * caller who skips this cannot obtain a signature anyway.
 */

export type UploadRequestViolation =
  | "photos.none"
  | "photos.tooMany"
  | "contentType.unsupported"
  | "byteLength.invalid";

export interface RequestedUpload {
  readonly contentType: string;
  /** The browser knows this before the upload starts; it is signed exactly. */
  readonly byteLength: number;
}

/**
 * Returns every violation, in the order the fields were submitted, so a
 * caller can say which of six photos is the problem rather than "something
 * was wrong".
 */
export function validateUploadRequest(
  requested: readonly RequestedUpload[],
): UploadRequestViolation[] {
  if (requested.length === 0) return ["photos.none"];

  // Refused, never truncated. Silently signing the first six of ten would
  // publish a listing missing photos the publisher believes they attached,
  // and nothing downstream could tell that from a deliberate choice.
  if (requested.length > MAX_PHOTOS_PER_LISTING) return ["photos.tooMany"];

  const violations: UploadRequestViolation[] = [];
  for (const upload of requested) {
    const declared = upload.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!(SUPPORTED_PHOTO_CONTENT_TYPES as readonly string[]).includes(declared)) {
      // The type is pinned into the signature, so an unvetted value here is a
      // signed grant to publish it from a public bucket — and `image/svg+xml`
      // is both a legitimate image type and a document that executes script.
      violations.push("contentType.unsupported");
    }

    if (
      !Number.isInteger(upload.byteLength) ||
      upload.byteLength <= 0 ||
      upload.byteLength > MAX_PHOTO_BYTES
    ) {
      // A declared size is what lets `ContentLength` be signed exactly, so a
      // body of any other length fails at R2's edge rather than after a
      // serverless function has already held it in memory.
      violations.push("byteLength.invalid");
    }
  }

  return violations;
}
