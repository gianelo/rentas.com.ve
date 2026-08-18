import { describe, expect, it } from "vitest";
import { DETAIL_MAX_EDGE } from "../../../src/modules/listing-publication/infrastructure/photo-derivatives";
import { computeResize, MAX_UPLOAD_EDGE } from "./compress";

/**
 * The one part of on-device compression that can ship wrong without anyone
 * noticing: which size the image is reduced to. Everything else here is the
 * browser's canvas doing its job.
 */

describe("computeResize", () => {
  it("leaves a photo already within the ceiling untouched", () => {
    // Never enlarge. A small photo is not improved by being stretched, and
    // those bytes are ones the connection could not afford.
    const small = { width: 800, height: 600 };
    expect(computeResize(small)).toEqual(small);
    expect(computeResize({ width: MAX_UPLOAD_EDGE, height: 900 })).toEqual({
      width: MAX_UPLOAD_EDGE,
      height: 900,
    });
  });

  it("scales a 12 MP phone photo by its longest edge, keeping the ratio", () => {
    // 4032 × 3024 is what a 12 MP camera produces.
    const resized = computeResize({ width: 4032, height: 3024 });

    expect(Math.max(resized.width, resized.height)).toBe(MAX_UPLOAD_EDGE);
    expect(resized.width / resized.height).toBeCloseTo(4032 / 3024, 2);
  });

  it("uses the longest edge whichever way the photo is turned", () => {
    // Portrait matters: a phone held upright is the common case, and a rule
    // written against width alone would leave those photos full size.
    const portrait = computeResize({ width: 3024, height: 4032 });

    expect(portrait.height).toBe(MAX_UPLOAD_EDGE);
    expect(portrait.width).toBeLessThan(MAX_UPLOAD_EDGE);
  });

  it("never produces a zero-pixel side", () => {
    // A hard-scaled panorama would otherwise reach zero, which no decoder
    // accepts — and the failure would arrive as a corrupt upload rather than
    // as a refused one.
    const panorama = computeResize({ width: 20_000, height: 3 });

    expect(panorama.height).toBeGreaterThanOrEqual(1);
    expect(panorama.width).toBe(MAX_UPLOAD_EDGE);
  });

  it("stays above the size the server-side derivative needs", () => {
    // The load-bearing relationship, asserted against the real constant
    // rather than a copy of the number: uploading below DETAIL_MAX_EDGE would
    // make `sharp` upscale — inventing pixels and losing quality for no saved
    // bytes. If either value moves, this fails and says so.
    expect(MAX_UPLOAD_EDGE).toBeGreaterThan(DETAIL_MAX_EDGE);
  });

  it("cuts a phone photo to roughly a sixth of its area", () => {
    const source = { width: 4032, height: 3024 };
    const resized = computeResize(source);
    const ratio = (resized.width * resized.height) / (source.width * source.height);

    expect(ratio).toBeLessThan(0.2);
  });
});
