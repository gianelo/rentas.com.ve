import { describe, expect, it } from "vitest";
import {
  inspectUploadedPhoto,
  MAX_PHOTO_BYTES,
  SUPPORTED_PHOTO_CONTENT_TYPES,
} from "./uploaded-photo";

/**
 * design.md's security table, "Photo upload" row: "MIME + magic-byte + size
 * validation before persistence — non-image and oversized payloads
 * rejected."
 *
 * The magic-byte half is the one that matters, and it is worth being blunt
 * about why. `Content-Type` is a CLAIM the uploader makes about their own
 * bytes. Nothing verifies it. A caller who wants to store an SVG full of
 * script, or a ZIP, or an executable, simply labels it `image/jpeg`. The
 * only statement about a file that the uploader cannot forge is the file's
 * own header, so that is what gets read.
 *
 * A declared type that disagrees with the bytes is treated as a distinct,
 * more serious violation than an unsupported type. One is a browser sending
 * something we do not handle; the other is somebody lying about their
 * payload.
 */

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

/** "RIFF" + 4 size bytes + "WEBP". */
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

/** HEIC/HEIF: a `ftyp` box at offset 4 with a `heic` brand. */
const HEIC = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
]);

function padded(header: Uint8Array, totalBytes: number): Uint8Array {
  const bytes = new Uint8Array(totalBytes);
  bytes.set(header.subarray(0, Math.min(header.length, totalBytes)));
  return bytes;
}

describe("inspectUploadedPhoto", () => {
  describe("accepts what the pipeline can actually process", () => {
    it.each([
      ["JPEG", JPEG, "image/jpeg"],
      ["PNG", PNG, "image/png"],
      ["WebP", WEBP, "image/webp"],
    ])("accepts a %s whose bytes match its declared type", (_label, header, contentType) => {
      expect(inspectUploadedPhoto(padded(header, 4096), contentType)).toEqual([]);
    });

    it("exposes its supported types, so the form's accept attribute cannot drift", () => {
      // A file input advertising a type the guard rejects wastes a
      // publisher's upload; one omitting a type the guard accepts hides a
      // format that would have worked. One list, read by both.
      expect(SUPPORTED_PHOTO_CONTENT_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
    });
  });

  describe("magic bytes over declared type — the forgery cases", () => {
    it("rejects an SVG that calls itself a JPEG", () => {
      // The case this guard exists for. SVG is a document format that
      // executes script, `image/svg+xml` is a legitimate image MIME type,
      // and a public bucket serving it under the right content type gives an
      // attacker script execution on the origin.
      expect(inspectUploadedPhoto(padded(SVG, 4096), "image/jpeg")).toContain(
        "bytes.contentTypeMismatch",
      );
    });

    it("rejects a ZIP that calls itself a PNG", () => {
      expect(inspectUploadedPhoto(padded(ZIP, 4096), "image/png")).toContain(
        "bytes.contentTypeMismatch",
      );
    });

    it("rejects a real PNG that calls itself a JPEG", () => {
      // Both are supported formats, so neither the type nor the bytes are
      // suspicious alone. They still disagree, and a pipeline that trusts
      // the label would hand sharp the wrong decoder hint.
      expect(inspectUploadedPhoto(padded(PNG, 4096), "image/jpeg")).toContain(
        "bytes.contentTypeMismatch",
      );
    });

    it("reports an unrecognised payload as BOTH not-an-image and a mismatch", () => {
      // Two true statements about the same file, and both are kept. "Not an
      // image" is what the publisher needs to be told; "the label
      // disagreed" is the one worth counting, because a browser does not
      // accidentally attach `image/jpeg` to arbitrary bytes.
      const garbage = padded(Uint8Array.from([0x00, 0x01, 0x02, 0x03]), 4096);

      expect(inspectUploadedPhoto(garbage, "image/jpeg")).toEqual([
        "bytes.notAnImage",
        "bytes.contentTypeMismatch",
      ]);
    });

    it("does not accuse an honestly-declared unsupported format of lying", () => {
      // A GIF sent as `image/gif` is a format we do not decode, not a
      // forgery. Reporting a mismatch here would inflate the one signal
      // that is supposed to mean somebody tampered with the label.
      expect(inspectUploadedPhoto(padded(GIF, 4096), "image/gif")).not.toContain(
        "bytes.contentTypeMismatch",
      );
    });
  });

  describe("formats that are images but are still refused", () => {
    it("rejects SVG even when honestly declared", () => {
      const errors = inspectUploadedPhoto(padded(SVG, 4096), "image/svg+xml");

      expect(errors).toContain("contentType.unsupported");
    });

    it("rejects GIF", () => {
      expect(inspectUploadedPhoto(padded(GIF, 4096), "image/gif")).toContain(
        "contentType.unsupported",
      );
    });

    /**
     * HEIC is the iPhone camera default, so this rejection is a real product
     * decision and not an oversight — see the note in the implementation.
     * iOS normally transcodes to JPEG when a photo is chosen through a file
     * input, which is why this is survivable, but it is NOT guaranteed.
     */
    it("rejects HEIC, and this is flagged as an open question, not a settled rule", () => {
      expect(inspectUploadedPhoto(padded(HEIC, 4096), "image/heic")).toContain(
        "contentType.unsupported",
      );
    });
  });

  describe("size", () => {
    it("rejects a payload over the byte ceiling", () => {
      expect(inspectUploadedPhoto(padded(JPEG, MAX_PHOTO_BYTES + 1), "image/jpeg")).toContain(
        "bytes.tooLarge",
      );
    });

    it("accepts a payload exactly at the ceiling", () => {
      expect(inspectUploadedPhoto(padded(JPEG, MAX_PHOTO_BYTES), "image/jpeg")).toEqual([]);
    });

    it("rejects an empty payload", () => {
      expect(inspectUploadedPhoto(new Uint8Array(0), "image/jpeg")).toContain("bytes.empty");
    });

    it("rejects a payload too short to carry a header, without reading past its end", () => {
      // A two-byte file cannot be inspected. Reading beyond it would throw
      // in some runtimes and silently read zeros in others, and "silently
      // reads zeros" is how a truncated upload gets classified as a valid
      // format.
      expect(() => inspectUploadedPhoto(Uint8Array.from([0xff, 0xd8]), "image/jpeg")).not.toThrow();
      expect(inspectUploadedPhoto(Uint8Array.from([0xff, 0xd8]), "image/jpeg")).toContain(
        "bytes.notAnImage",
      );
    });
  });

  it("normalises the declared type before comparing it", () => {
    // Browsers and proxies send `image/jpeg; charset=binary`, and casing is
    // not guaranteed. Rejecting a legitimate photo over a parameter the
    // uploader did not choose would be the guard failing at its own job.
    expect(inspectUploadedPhoto(padded(JPEG, 4096), "IMAGE/JPEG; charset=binary")).toEqual([]);
  });
});
