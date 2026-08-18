import { describe, expect, it } from "vitest";
import { MAX_PHOTOS_PER_LISTING } from "../../../src/modules/listing-publication/domain/publishable-listing";
import { MAX_PHOTO_BYTES } from "../../../src/modules/listing-publication/domain/uploaded-photo";
import { type RequestedUpload, validateUploadRequest } from "./upload-request";

/**
 * A presigned PUT is a write grant, so this is the gate that decides what is
 * worth signing. Every assertion below is about something a browser can
 * claim and this server cannot verify any other way.
 */

const photo: RequestedUpload = { contentType: "image/jpeg", byteLength: 2_000_000 };

function photos(count: number): RequestedUpload[] {
  return Array.from({ length: count }, () => photo);
}

describe("validateUploadRequest", () => {
  it("accepts a normal set of phone photos", () => {
    expect(validateUploadRequest(photos(3))).toEqual([]);
  });

  it("accepts exactly the maximum, and refuses one more", () => {
    expect(validateUploadRequest(photos(MAX_PHOTOS_PER_LISTING))).toEqual([]);
    expect(validateUploadRequest(photos(MAX_PHOTOS_PER_LISTING + 1))).toEqual(["photos.tooMany"]);
  });

  it("refuses rather than truncating", () => {
    // Silently signing the first six of ten publishes a listing missing
    // photos the publisher believes they attached, and nothing downstream
    // could tell that from a deliberate choice.
    expect(validateUploadRequest(photos(10))).toEqual(["photos.tooMany"]);
  });

  it("refuses an empty request", () => {
    expect(validateUploadRequest([])).toEqual(["photos.none"]);
  });

  it.each([
    ["image/svg+xml", "a document that executes script"],
    ["image/gif", "a format the derivative pipeline does not decode"],
    ["image/heic", "the iPhone camera default, excluded on purpose"],
    ["application/pdf", "not an image at all"],
    ["", "nothing at all"],
  ])("refuses %s — %s", (contentType) => {
    expect(validateUploadRequest([{ ...photo, contentType }])).toContain("contentType.unsupported");
  });

  it("accepts a content type carrying a parameter, as real clients send", () => {
    // `image/jpeg; charset=binary` and `IMAGE/JPEG` are both things browsers
    // send. Refusing a legitimate photo over a parameter the publisher did
    // not choose would be this guard failing at its own job.
    expect(
      validateUploadRequest([{ ...photo, contentType: "IMAGE/JPEG; charset=binary" }]),
    ).toEqual([]);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1024.5],
    ["not a number", Number.NaN],
    ["above the ceiling", MAX_PHOTO_BYTES + 1],
  ])("refuses a %s declared size", (_case, byteLength) => {
    expect(validateUploadRequest([{ ...photo, byteLength }])).toContain("byteLength.invalid");
  });

  it("accepts exactly the byte ceiling", () => {
    expect(validateUploadRequest([{ ...photo, byteLength: MAX_PHOTO_BYTES }])).toEqual([]);
  });

  it("reports one violation per offending photo, in submission order", () => {
    // Three photos, two problems, one each: the publisher needs to know which
    // file is the problem, not merely that something was wrong.
    const mixed = [
      photo,
      { contentType: "image/svg+xml", byteLength: 2_000 },
      { contentType: "image/jpeg", byteLength: 0 },
    ];

    expect(validateUploadRequest(mixed)).toEqual(["contentType.unsupported", "byteLength.invalid"]);
  });

  it("does not invent a minimum size", () => {
    // A ten-byte "photo" is obviously not one, and it is accepted here on
    // purpose: the magic-byte guard reads the file's own header after upload
    // and refuses it for what it actually is. A second, arbitrary threshold
    // in this layer would only add a number nobody can justify.
    expect(validateUploadRequest([{ ...photo, byteLength: 10 }])).toEqual([]);
  });
});
