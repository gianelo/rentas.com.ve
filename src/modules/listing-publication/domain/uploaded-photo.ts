/**
 * Upload guard — design.md's security table, "Photo upload": "MIME +
 * magic-byte + size validation before persistence. Non-image and oversized
 * payloads rejected."
 *
 * Pure over bytes, so it runs the same whether the payload arrived through
 * the single-listing publish flow or the broker importer's photo phase
 * (design.md's two-phase import reuses this pipeline unchanged). No sharp,
 * no R2, no network: this layer decides whether bytes are worth decoding at
 * all, which is precisely the check that must happen BEFORE handing them to
 * a decoder.
 *
 * ## Why the header and not the Content-Type
 *
 * `Content-Type` is a claim the uploader makes about their own bytes.
 * Nothing verifies it, and the client is not a trusted party — the publish
 * flow hands out a presigned PUT, so bytes reach R2 without passing through
 * any code of ours. The only statement about a file its sender cannot forge
 * is the file's own header.
 *
 * A declared type that DISAGREES with the header is reported separately
 * from an unsupported one, because they are different events: the second is
 * a browser sending a format we do not handle, the first is somebody lying
 * about their payload.
 */

export type UploadViolation =
  | "contentType.unsupported"
  | "bytes.empty"
  | "bytes.tooLarge"
  | "bytes.notAnImage"
  | "bytes.contentTypeMismatch";

/**
 * The formats the derivative pipeline (task 3.11) can decode and re-encode,
 * exported so the form's `accept` attribute reads the same list the guard
 * enforces. A file input advertising a type the guard rejects wastes a
 * publisher's upload; one omitting a type the guard accepts hides a format
 * that would have worked.
 *
 * Deliberately excluded:
 *
 * - **SVG.** It is a document format that executes script, and
 *   `image/svg+xml` is a perfectly legitimate image MIME type. Served from a
 *   public bucket under its own content type, it is script execution on the
 *   origin. There is no version of this product that needs a vector
 *   photograph.
 * - **GIF.** Animation buys nothing for a rental photo and costs bytes
 *   against a budget (D12) that is already the binding constraint.
 * - **HEIC/HEIF.** This one is a real product decision, not an oversight,
 *   and it is the weakest link here: **HEIC is the iPhone camera default.**
 *   iOS normally transcodes to JPEG when a photo is chosen through a file
 *   input, which is why rejecting it is survivable — but that behaviour is
 *   not guaranteed, and `sharp` only decodes HEIF when libvips was built
 *   with libheif, which is not a safe assumption on a serverless runtime.
 *   **OPEN QUESTION for the founder:** if iPhone publishers hit this, the
 *   answer is a client-side transcode before upload, not loosening the
 *   guard. Recorded rather than discovered from a support message.
 */
export const SUPPORTED_PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * 10 MB. **This number is chosen here, not inherited from the design**,
 * which states only that "a phone photo is 3–8 MB" (D12's storage
 * calculation). 10 MB clears that range with headroom for a high-end
 * camera without accepting a payload that no phone produces.
 *
 * It is not the only enforcement point, and must not be the only one: the
 * presigned PUT carries a `content-length-range` (design.md's security
 * table, "Presigned upload scope") so R2 refuses an oversized body before
 * a single byte reaches us. This check is what catches a payload that
 * arrived some other way. Both numbers must move together.
 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type SupportedContentType = (typeof SUPPORTED_PHOTO_CONTENT_TYPES)[number];

/** Byte-level signatures. `undefined` positions are wildcards. */
interface Signature {
  readonly contentType: SupportedContentType;
  readonly offset: number;
  readonly bytes: readonly number[];
  /** A second anchor, for containers whose brand follows a length field. */
  readonly also?: { readonly offset: number; readonly bytes: readonly number[] };
}

const SIGNATURES: readonly Signature[] = [
  { contentType: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { contentType: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  {
    contentType: "image/webp",
    offset: 0,
    bytes: [0x52, 0x49, 0x46, 0x46], // "RIFF"
    also: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // "WEBP"
  },
];

function matchesAt(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  // Bounds-checked rather than trusting the slice: reading past the end
  // yields `undefined` in JS, and `undefined !== 0x00` happens to be true
  // here — but relying on that is how a truncated upload gets classified by
  // accident rather than on purpose.
  if (offset + expected.length > bytes.length) return false;
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

function detectContentType(bytes: Uint8Array): SupportedContentType | null {
  for (const signature of SIGNATURES) {
    if (!matchesAt(bytes, signature.offset, signature.bytes)) continue;
    if (signature.also && !matchesAt(bytes, signature.also.offset, signature.also.bytes)) continue;
    return signature.contentType;
  }
  return null;
}

/**
 * `image/jpeg; charset=binary` and `IMAGE/JPEG` are both things real clients
 * send. Rejecting a legitimate photo over a parameter the publisher did not
 * choose would be this guard failing at its own job.
 */
function normaliseContentType(declared: string): string {
  return declared.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isSupported(contentType: string): contentType is SupportedContentType {
  return (SUPPORTED_PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType);
}

export function inspectUploadedPhoto(
  bytes: Uint8Array,
  declaredContentType: string,
): UploadViolation[] {
  const violations: UploadViolation[] = [];

  if (bytes.length === 0) {
    // Nothing further can be said about zero bytes, and reporting a
    // cascade of violations for one empty file helps nobody.
    return ["bytes.empty"];
  }

  if (bytes.length > MAX_PHOTO_BYTES) {
    violations.push("bytes.tooLarge");
  }

  const declared = normaliseContentType(declaredContentType);
  if (!isSupported(declared)) {
    violations.push("contentType.unsupported");
  }

  const actual = detectContentType(bytes);
  if (actual === null) {
    violations.push("bytes.notAnImage");
  }

  // Reported whenever the uploader claimed a type we WOULD have accepted and
  // the bytes say otherwise — including when the bytes are not an image at
  // all. Both facts are true of a ZIP labelled `image/png`, and both are
  // worth keeping: "not an image" is what the publisher needs to be told,
  // "the label disagreed" is the one worth counting, because a browser does
  // not accidentally attach `image/png` to a ZIP.
  //
  // An honestly-declared GIF gets `contentType.unsupported` and
  // `bytes.notAnImage`, but NOT this: nobody lied, the format is simply one
  // the pipeline does not decode.
  //
  // This shape was wrong on the first pass — the code reported only
  // `bytes.notAnImage` while the comment above claimed the mismatch existed
  // to separate "unsupported" from "forged". The test disagreed with the
  // implementation and the comment was right.
  if (isSupported(declared) && actual !== declared) {
    violations.push("bytes.contentTypeMismatch");
  }

  return violations;
}
