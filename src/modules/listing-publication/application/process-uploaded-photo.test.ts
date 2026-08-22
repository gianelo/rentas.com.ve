import { describe, expect, it, vi } from "vitest";
import { MAX_PHOTO_BYTES } from "../domain/uploaded-photo";
import type { PhotoDerivationPort } from "./ports/photo-derivation.port";
import type { PhotoStoragePort, StoredObject, UploadTarget } from "./ports/photo-storage.port";
import { processUploadedPhoto, RejectedUploadError } from "./process-uploaded-photo";

/**
 * Task 3.7's remaining half — "sharp-based upload guard before persistence":
 * the step after the browser's presigned PUT and before any row is written.
 *
 * **No network, no bucket, no sharp.** Storage and derivation are both ports,
 * so all three guarantees (owned key, honest bytes, original discarded) are
 * assertable on every push. What they stand in for is already proven on its
 * own — `inspectUploadedPhoto` over real byte signatures, `deriveListingPhoto`
 * over real noise fixtures — and repeating that here would test `sharp`.
 */

const PUBLISHER = "pub_7f3a";
const TOKEN = "9c1d4e6f8a2b0c3d5e7f9a1b3c5d7e9f";
const INCOMING_KEY = `incoming/${PUBLISHER}/${TOKEN}`;

/** A real PNG header, so the guard under test sees what it actually reads. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const NOT_AN_IMAGE = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);

const THUMBNAIL = new Uint8Array([0x01, 0x02, 0x03]);
const DETAIL = new Uint8Array([0x04, 0x05, 0x06, 0x07, 0x08]);

interface StorageStub extends PhotoStoragePort {
  readonly reads: string[];
  readonly puts: { key: string; bytes: Uint8Array; contentType: string }[];
  readonly removed: string[];
}

function makeStorage(
  overrides: {
    read?: (key: string) => Promise<Uint8Array>;
    remove?: (key: string) => Promise<void>;
  } = {},
): StorageStub {
  const reads: string[] = [];
  const puts: { key: string; bytes: Uint8Array; contentType: string }[] = [];
  const removed: string[] = [];

  return {
    reads,
    puts,
    removed,
    async createUploadTarget(): Promise<UploadTarget> {
      throw new Error("not used by this use case");
    },
    async read(key: string): Promise<Uint8Array> {
      reads.push(key);
      return overrides.read ? overrides.read(key) : PNG;
    },
    async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
      puts.push({ key, bytes, contentType });
      return { key, byteLength: bytes.byteLength };
    },
    async remove(key: string): Promise<void> {
      removed.push(key);
      if (overrides.remove) await overrides.remove(key);
    },
  };
}

// Las cinco, con dos buffers distintos repartidos: alcanza para probar que
// cada derivada sube a su propia clave y que ninguna se pisa con otra.
const derive: PhotoDerivationPort = async () => ({
  thumb: { bytes: THUMBNAIL, byteLength: THUMBNAIL.byteLength },
  card: { bytes: THUMBNAIL, byteLength: THUMBNAIL.byteLength },
  strip: { bytes: DETAIL, byteLength: DETAIL.byteLength },
  detail: { bytes: DETAIL, byteLength: DETAIL.byteLength },
  full: { bytes: DETAIL, byteLength: DETAIL.byteLength },
});

function request(overrides: Partial<Parameters<typeof processUploadedPhoto>[0]> = {}) {
  return {
    publisherId: PUBLISHER,
    incomingKey: INCOMING_KEY,
    declaredContentType: "image/png",
    ...overrides,
  };
}

describe("processUploadedPhoto", () => {
  it("sube las cinco derivadas y reporta sus claves y tamaños medidos", async () => {
    const storage = makeStorage();

    const processed = await processUploadedPhoto(request(), { storage, derive });

    expect(storage.reads).toEqual([INCOMING_KEY]);
    // Una fila por derivada, cada una a su propia clave. Antes eran cuatro
    // campos planos, y esa forma congelaba el número de derivadas en dos.
    expect(processed).toEqual({
      derivatives: [
        {
          name: "thumb",
          key: `photos/${PUBLISHER}/${TOKEN}/thumb.webp`,
          byteLength: THUMBNAIL.byteLength,
        },
        {
          name: "card",
          key: `photos/${PUBLISHER}/${TOKEN}/card.webp`,
          byteLength: THUMBNAIL.byteLength,
        },
        {
          name: "strip",
          key: `photos/${PUBLISHER}/${TOKEN}/strip.webp`,
          byteLength: DETAIL.byteLength,
        },
        {
          name: "detail",
          key: `photos/${PUBLISHER}/${TOKEN}/detail.webp`,
          byteLength: DETAIL.byteLength,
        },
        {
          name: "full",
          key: `photos/${PUBLISHER}/${TOKEN}/full.webp`,
          byteLength: DETAIL.byteLength,
        },
      ],
    });
  });

  it("sube las cinco como WebP y nada más", async () => {
    const storage = makeStorage();

    await processUploadedPhoto(request(), { storage, derive });

    expect(storage.puts.map((put) => put.contentType)).toEqual(Array(5).fill("image/webp"));
    // D12's other half, asserted rather than assumed. The adapter refuses a
    // non-WebP content type, but a caller that mislabelled the original would
    // slip past it — this compares the actual bytes.
    for (const put of storage.puts) {
      expect(Array.from(put.bytes)).not.toEqual(Array.from(PNG));
    }
  });

  it("deletes the original after deriving — D12 keeps derivatives only", async () => {
    const storage = makeStorage();

    await processUploadedPhoto(request(), { storage, derive });

    expect(storage.removed).toEqual([INCOMING_KEY]);
  });

  it("refuses a key belonging to another publisher without reading it", async () => {
    const storage = makeStorage();

    await expect(
      processUploadedPhoto(request({ incomingKey: `incoming/someone_else/${TOKEN}` }), {
        storage,
        derive,
      }),
    ).rejects.toThrow(RejectedUploadError);

    // The check has to happen BEFORE the read, or the guard becomes a
    // notification that somebody else's photo was already downloaded.
    expect(storage.reads).toEqual([]);
    expect(storage.removed).toEqual([]);
  });

  it.each([
    ["a promoted key rather than an incoming one", `photos/${PUBLISHER}/${TOKEN}/detail.webp`],
    ["traversal out of the publisher's prefix", `incoming/${PUBLISHER}/../other/${TOKEN}`],
    ["a nested key the adapter never issues", `incoming/${PUBLISHER}/${TOKEN}/extra`],
    ["an empty token", `incoming/${PUBLISHER}/`],
    ["no prefix at all", TOKEN],
  ])("refuses %s", async (_case, incomingKey) => {
    const storage = makeStorage();

    await expect(
      processUploadedPhoto(request({ incomingKey }), { storage, derive }),
    ).rejects.toThrow(RejectedUploadError);
    expect(storage.reads).toEqual([]);
  });

  it("reports the guard's own violations and never derives from rejected bytes", async () => {
    const storage = makeStorage({ read: async () => NOT_AN_IMAGE });
    const spy = vi.fn(derive);

    const failure = await processUploadedPhoto(request(), { storage, derive: spy }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(RejectedUploadError);
    expect((failure as RejectedUploadError).violations).toEqual([
      "bytes.notAnImage",
      "bytes.contentTypeMismatch",
    ]);
    expect(spy).not.toHaveBeenCalled();
    expect(storage.puts).toEqual([]);
  });

  it("deletes rejected bytes instead of leaving them to accumulate", async () => {
    const storage = makeStorage({ read: async () => NOT_AN_IMAGE });

    await processUploadedPhoto(request(), { storage, derive }).catch(() => undefined);

    expect(storage.removed).toEqual([INCOMING_KEY]);
  });

  it("refuses an object above the byte ceiling", async () => {
    const oversized = new Uint8Array(MAX_PHOTO_BYTES + 1);
    oversized.set(PNG.subarray(0, 8));
    const storage = makeStorage({ read: async () => oversized });

    const failure = await processUploadedPhoto(request(), { storage, derive }).catch(
      (error: unknown) => error,
    );

    expect((failure as RejectedUploadError).violations).toEqual(["bytes.tooLarge"]);
  });

  it("deletes the original when derivation fails, and surfaces that failure", async () => {
    const storage = makeStorage();
    const exploding: PhotoDerivationPort = async () => {
      throw new Error("photo-derivatives: input exceeds pixel limit");
    };

    await expect(processUploadedPhoto(request(), { storage, derive: exploding })).rejects.toThrow(
      /pixel limit/,
    );

    // Otherwise a decompression bomb is stored indefinitely: nothing sweeps
    // the incoming prefix, and the object outlives the request that made it.
    expect(storage.removed).toEqual([INCOMING_KEY]);
  });

  it("keeps the rejection reason when the cleanup delete also fails", async () => {
    const storage = makeStorage({
      read: async () => NOT_AN_IMAGE,
      remove: async () => {
        throw new Error("r2 unavailable");
      },
    });

    const failure = await processUploadedPhoto(request(), { storage, derive }).catch(
      (error: unknown) => error,
    );

    // The publisher needs to be told their file was not an image. A storage
    // hiccup replacing that with "r2 unavailable" would report the smaller
    // problem and hide the actionable one.
    expect(failure).toBeInstanceOf(RejectedUploadError);
    expect((failure as RejectedUploadError).cause).toBeInstanceOf(Error);
  });
});
