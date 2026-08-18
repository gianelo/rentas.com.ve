/**
 * On-device compression, before a byte leaves the phone.
 *
 * **This is the only reason JavaScript is allowed on this screen**
 * (SISTEMA.md: "el único lugar donde se permite JS, para comprimir en el
 * dispositivo antes de subir"). A phone photo is 3–8 MB and six of them on a
 * Venezuelan mobile connection is the difference between publishing and
 * giving up — the upload is the slowest thing this product ever asks anyone
 * to do.
 *
 * It does **not** replace the server-side derivatives. `sharp` still produces
 * the 128 × 96 thumbnail and the ≤ 200 KB detail image, and still discards
 * the original (D12). What happens here only decides how many bytes have to
 * cross the network to get there.
 */

/**
 * 1600px on the longest edge.
 *
 * Chosen against the pipeline that consumes it rather than picked for
 * roundness: the detail derivative is 1280 on its longest edge, so anything
 * below that would upload an image `sharp` then has to upscale — inventing
 * pixels and costing quality for no saved bytes. 1600 keeps a margin above
 * 1280 so the server-side resize still has real detail to work from, while
 * cutting a 4032 × 3024 phone photo to about a sixth of its area.
 */
export const MAX_UPLOAD_EDGE = 1600;

/**
 * 0.82. High enough that the artefacts WebP introduces do not survive the
 * second encode into the detail image — a room photo compressed twice at low
 * quality reads as dirt on the walls, and the publisher never sees it happen.
 */
export const UPLOAD_QUALITY = 0.82;

/** WebP, matching what the derivative pipeline emits and stores. */
export const UPLOAD_CONTENT_TYPE = "image/webp";

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * The size an image should be resized to before upload, or the size it
 * already is.
 *
 * Pure, so the decision is provable without a canvas, a browser or a file —
 * which matters because this is the only part of the compression anyone can
 * get wrong in a way that ships.
 */
export function computeResize(source: Size, maxEdge: number = MAX_UPLOAD_EDGE): Size {
  const longest = Math.max(source.width, source.height);

  // Never enlarge. A small photo is not improved by being stretched, and the
  // bytes spent doing it are bytes the connection could not afford.
  if (longest <= maxEdge) return source;

  const scale = maxEdge / longest;
  return {
    // Rounded, and floored at 1: a very wide panorama scaled hard would
    // otherwise reach a zero-pixel side, which is not an image any decoder
    // will accept.
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}
