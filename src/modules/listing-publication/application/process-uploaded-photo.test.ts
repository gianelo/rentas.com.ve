import { describe, expect, it, vi } from "vitest";
import type {
  NewPhotoHash,
  PhotoHashMatch,
  PhotoHashPort,
} from "../../listing-trust/application/ports/photo-hash.port";
import { MAX_DUPLICATE_HAMMING_DISTANCE } from "../../listing-trust/domain/hamming-distance";
import { toPerceptualHash } from "../../listing-trust/domain/perceptual-hash";
import { MAX_PHOTO_BYTES } from "../domain/uploaded-photo";
import type { PhotoDerivationPort } from "./ports/photo-derivation.port";
import type { PhotoHashComputationPort } from "./ports/photo-hash-computation.port";
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
  /**
   * Cada operación contra R2, en orden y con su clave. **El registro literal es
   * lo único que distingue borrar las derivadas que sí subieron de borrar el
   * original** (18.39, la técnica de `publish-listing.test.ts`): «se llamó a
   * `remove`» no separa las dos, y acá el original tiene que SOBREVIVIR.
   */
  readonly calls: string[];
}

function makeStorage(
  overrides: {
    read?: (key: string) => Promise<Uint8Array>;
    put?: (key: string) => Promise<void>;
    remove?: (key: string) => Promise<void>;
  } = {},
): StorageStub {
  const reads: string[] = [];
  const puts: { key: string; bytes: Uint8Array; contentType: string }[] = [];
  const removed: string[] = [];
  const calls: string[] = [];

  return {
    reads,
    puts,
    removed,
    calls,
    async createUploadTarget(): Promise<UploadTarget> {
      throw new Error("not used by this use case");
    },
    async read(key: string): Promise<Uint8Array> {
      reads.push(key);
      calls.push(`read:${key}`);
      return overrides.read ? overrides.read(key) : PNG;
    },
    async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
      calls.push(`put:${key}`);
      if (overrides.put) await overrides.put(key);
      puts.push({ key, bytes, contentType });
      return { key, byteLength: bytes.byteLength };
    },
    async remove(key: string): Promise<void> {
      calls.push(`remove:${key}`);
      removed.push(key);
      if (overrides.remove) await overrides.remove(key);
    },
  };
}

/** Las cinco claves promovidas de esta foto, en el orden en que se suben. */
const PROMOTED_KEYS = ["thumb", "card", "strip", "detail", "full"].map(
  (name) => `photos/${PUBLISHER}/${TOKEN}/${name}.webp`,
);

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

/** design.md D4 — an arbitrary, fixed 64-bit value distinct from `0n`. */
const SOME_HASH = toPerceptualHash(0x00000000000000ffn);

const computeHash: PhotoHashComputationPort = async () => SOME_HASH;

/** No stored photo ever matches — the default for tests that do not care. */
function noMatchPhotoHashes(): PhotoHashPort & { readonly recorded: NewPhotoHash[] } {
  const recorded: NewPhotoHash[] = [];
  return {
    recorded,
    async findMatchesFromOtherPublishers(): Promise<PhotoHashMatch[]> {
      return [];
    },
    async record(newHash: NewPhotoHash): Promise<void> {
      recorded.push(newHash);
    },
  };
}

describe("processUploadedPhoto", () => {
  it("sube las cinco derivadas y reporta sus claves y tamaños medidos", async () => {
    const storage = makeStorage();

    const processed = await processUploadedPhoto(request(), {
      storage,
      derive,
      computeHash,
      photoHashes: noMatchPhotoHashes(),
    });

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
      hash: SOME_HASH,
    });
  });

  it("sube las cinco como WebP y nada más", async () => {
    const storage = makeStorage();

    await processUploadedPhoto(request(), {
      storage,
      derive,
      computeHash,
      photoHashes: noMatchPhotoHashes(),
    });

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

    await processUploadedPhoto(request(), {
      storage,
      derive,
      computeHash,
      photoHashes: noMatchPhotoHashes(),
    });

    expect(storage.removed).toEqual([INCOMING_KEY]);
  });

  it("refuses a key belonging to another publisher without reading it", async () => {
    const storage = makeStorage();

    await expect(
      processUploadedPhoto(request({ incomingKey: `incoming/someone_else/${TOKEN}` }), {
        storage,
        derive,
        computeHash,
        photoHashes: noMatchPhotoHashes(),
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
      processUploadedPhoto(request({ incomingKey }), {
        storage,
        derive,
        computeHash,
        photoHashes: noMatchPhotoHashes(),
      }),
    ).rejects.toThrow(RejectedUploadError);
    expect(storage.reads).toEqual([]);
  });

  it("reports the guard's own violations and never derives from rejected bytes", async () => {
    const storage = makeStorage({ read: async () => NOT_AN_IMAGE });
    const spy = vi.fn(derive);

    const failure = await processUploadedPhoto(request(), {
      storage,
      derive: spy,
      computeHash,
      photoHashes: noMatchPhotoHashes(),
    }).catch((error: unknown) => error);

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

    await processUploadedPhoto(request(), {
      storage,
      derive,
      computeHash,
      photoHashes: noMatchPhotoHashes(),
    }).catch(() => undefined);

    expect(storage.removed).toEqual([INCOMING_KEY]);
  });

  it("refuses an object above the byte ceiling", async () => {
    const oversized = new Uint8Array(MAX_PHOTO_BYTES + 1);
    oversized.set(PNG.subarray(0, 8));
    const storage = makeStorage({ read: async () => oversized });

    const failure = await processUploadedPhoto(request(), {
      storage,
      derive,
      computeHash,
      photoHashes: noMatchPhotoHashes(),
    }).catch((error: unknown) => error);

    expect((failure as RejectedUploadError).violations).toEqual(["bytes.tooLarge"]);
  });

  it("deletes the original when derivation fails, and surfaces that failure", async () => {
    const storage = makeStorage();
    const exploding: PhotoDerivationPort = async () => {
      throw new Error("photo-derivatives: input exceeds pixel limit");
    };

    await expect(
      processUploadedPhoto(request(), {
        storage,
        derive: exploding,
        computeHash,
        photoHashes: noMatchPhotoHashes(),
      }),
    ).rejects.toThrow(/pixel limit/);

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

    const failure = await processUploadedPhoto(request(), {
      storage,
      derive,
      computeHash,
      photoHashes: noMatchPhotoHashes(),
    }).catch((error: unknown) => error);

    // The publisher needs to be told their file was not an image. A storage
    // hiccup replacing that with "r2 unavailable" would report the smaller
    // problem and hide the actionable one.
    expect(failure).toBeInstanceOf(RejectedUploadError);
    expect((failure as RejectedUploadError).cause).toBeInstanceOf(Error);
  });

  /**
   * tasks.md 18.39 — **una foto se promueve entera o no deja nada.**
   *
   * Las cinco derivadas suben con un `Promise.all`, así que hasta ahora una que
   * rechazaba dejaba a las otras cuatro escritas bajo `photos/` y esta función
   * lanzaba ANTES de devolver sus claves: nadie río abajo se enteraba de que
   * existían. La limpieza de la 18.35 recorre FOTOS y no alcanza acá adentro —
   * junta lo que `processUploadedPhoto` devuelve, y en este camino no devuelve.
   *
   * `photos/` es también donde viven las derivadas de todos los avisos activos,
   * así que ninguna regla de ciclo de vida del bucket las distingue y lo único
   * que las delata es la ausencia de su fila.
   */
  describe("las cinco derivadas de una foto son atómicas (18.39)", () => {
    /** El PUT que rechaza, y las cuatro que sí quedaron escritas. */
    function storageFailingPut(...failing: string[]) {
      return makeStorage({
        put: async (key) => {
          if (failing.includes(key)) throw new Error(`R2 rechazó ${key}`);
        },
      });
    }

    it("borra las cuatro que sí subieron cuando la quinta rechaza", async () => {
      const storage = storageFailingPut(PROMOTED_KEYS[3] as string);

      await expect(
        processUploadedPhoto(request(), {
          storage,
          derive,
          computeHash,
          photoHashes: noMatchPhotoHashes(),
        }),
      ).rejects.toThrow(`R2 rechazó ${PROMOTED_KEYS[3]}`);

      // El arreglo literal: los cinco intentos primero —siguen siendo paralelos,
      // no en fila— y recién después los cuatro borrados, cada uno nombrado.
      expect(storage.calls).toEqual([
        `read:${INCOMING_KEY}`,
        ...PROMOTED_KEYS.map((key) => `put:${key}`),
        ...PROMOTED_KEYS.filter((key) => key !== PROMOTED_KEYS[3]).map((key) => `remove:${key}`),
      ]);
    });

    /**
     * **El par positivo del anterior, y no es simetría.** El original es lo único
     * con lo que se puede volver a derivar: D12 no lo guarda en ningún otro lado.
     * Borrarlo acá sería fabricar el defecto que esta tarea nombra aparte —una
     * foto que el borrador sigue dibujando y que ya no se puede publicar—, y la
     * regla de retención del bucket (18.23/18.36) ya lo alcanza si nadie vuelve.
     */
    it("y NO borra el original, que es con lo que se vuelve a intentar", async () => {
      const storage = storageFailingPut(PROMOTED_KEYS[0] as string);

      await expect(
        processUploadedPhoto(request(), {
          storage,
          derive,
          computeHash,
          photoHashes: noMatchPhotoHashes(),
        }),
      ).rejects.toThrow();

      expect(storage.removed).not.toContain(INCOMING_KEY);
    });

    /** El otro par positivo: una limpieza que borrara SIEMPRE pasaría las dos
     *  de arriba y se llevaría las derivadas de la foto que salió bien. */
    it("la foto que sube entera no borra ninguna derivada, y sí el original", async () => {
      const storage = makeStorage();

      await processUploadedPhoto(request(), {
        storage,
        derive,
        computeHash,
        photoHashes: noMatchPhotoHashes(),
      });

      expect(storage.calls).toEqual([
        `read:${INCOMING_KEY}`,
        ...PROMOTED_KEYS.map((key) => `put:${key}`),
        `remove:${INCOMING_KEY}`,
      ]);
    });

    it("propaga el motivo del PUT que falló aunque el borrado de limpieza también falle", async () => {
      const storage = makeStorage({
        put: async (key) => {
          if (key === PROMOTED_KEYS[4]) throw new Error("R2 rechazó la quinta");
        },
        remove: async () => {
          throw new Error("r2 unavailable");
        },
      });

      // Misma disciplina que `discardQuietly`: el motivo por el que la foto no
      // se promovió es lo que quien publica necesita leer, no el del barrido.
      await expect(
        processUploadedPhoto(request(), {
          storage,
          derive,
          computeHash,
          photoHashes: noMatchPhotoHashes(),
        }),
      ).rejects.toThrow("R2 rechazó la quinta");

      // Y una clave que R2 rechaza no deja sin intentar a las otras tres.
      expect(storage.removed).toEqual(PROMOTED_KEYS.slice(0, 4));
    });

    it("con dos rechazos propaga el primero, no el último", async () => {
      const storage = storageFailingPut(PROMOTED_KEYS[1] as string, PROMOTED_KEYS[3] as string);

      await expect(
        processUploadedPhoto(request(), {
          storage,
          derive,
          computeHash,
          photoHashes: noMatchPhotoHashes(),
        }),
      ).rejects.toThrow(`R2 rechazó ${PROMOTED_KEYS[1]}`);

      expect(storage.removed).toEqual([PROMOTED_KEYS[0], PROMOTED_KEYS[2], PROMOTED_KEYS[4]]);
    });
  });

  /**
   * Task 4.7 — the wiring that was missing entirely. `PhotoHashPort` and
   * `computeDHash` each had their own passing suite in isolation
   * (photo-hash.port.test.ts, sharp-dhash.test.ts); nothing called either
   * from a real upload path (attach-photo-to-draft.ts's own "known gap"
   * note, and AGENTS.md §5).
   */
  describe("D4 — cross-account perceptual-hash duplicate rejection", () => {
    it("computes the hash and returns it, so a caller can record it after persisting", async () => {
      const storage = makeStorage();

      const processed = await processUploadedPhoto(request(), {
        storage,
        derive,
        computeHash,
        photoHashes: noMatchPhotoHashes(),
      });

      expect(processed.hash).toBe(SOME_HASH);
    });

    it("rejects a photo matching another publisher's, and never derives, promotes or leaves the upload behind", async () => {
      const storage = makeStorage();
      const derived = vi.fn(derive);
      const photoHashes: PhotoHashPort = {
        async findMatchesFromOtherPublishers() {
          return [
            { photoId: "photo-thief", listingId: "listing-1", publisherId: "other", distance: 2 },
          ];
        },
        async record() {
          throw new Error("record must never be called from processUploadedPhoto");
        },
      };

      const failure = await processUploadedPhoto(request(), {
        storage,
        derive: derived,
        computeHash,
        photoHashes,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(RejectedUploadError);
      expect((failure as RejectedUploadError).violations).toEqual([
        "photo.duplicateAcrossPublishers",
      ]);
      // Mutation-check target: the expensive half of the pipeline (decode,
      // encode, upload) must never run for a photo already known stolen.
      expect(derived).not.toHaveBeenCalled();
      expect(storage.puts).toEqual([]);
      expect(storage.removed).toEqual([INCOMING_KEY]);
    });

    it("passes the caller's own publisherId to the exemption, not a hard-coded one", async () => {
      const storage = makeStorage();
      const seenExclusions: string[] = [];
      const photoHashes: PhotoHashPort = {
        async findMatchesFromOtherPublishers(_hash, excludePublisherId) {
          seenExclusions.push(excludePublisherId);
          return [];
        },
        async record() {},
      };

      await processUploadedPhoto(
        request({ publisherId: "publisher-xyz", incomingKey: `incoming/publisher-xyz/${TOKEN}` }),
        { storage, derive, computeHash, photoHashes },
      );

      expect(seenExclusions).toEqual(["publisher-xyz"]);
    });

    it("passes the calibrated threshold — MAX_DUPLICATE_HAMMING_DISTANCE, not a re-typed literal", async () => {
      const storage = makeStorage();
      const seenDistances: number[] = [];
      const photoHashes: PhotoHashPort = {
        async findMatchesFromOtherPublishers(_hash, _exclude, maxDistance) {
          seenDistances.push(maxDistance);
          return [];
        },
        async record() {},
      };

      await processUploadedPhoto(request(), { storage, derive, computeHash, photoHashes });

      expect(seenDistances).toEqual([MAX_DUPLICATE_HAMMING_DISTANCE]);
    });

    it("fails closed: a hash that cannot be computed refuses the submission rather than skipping the check", async () => {
      const storage = makeStorage();
      const derived = vi.fn(derive);
      const explodingHash: PhotoHashComputationPort = async () => {
        throw new Error("sharp: unsupported image format");
      };
      const photoHashes = noMatchPhotoHashes();
      const findSpy = vi.fn(photoHashes.findMatchesFromOtherPublishers);

      const failure = await processUploadedPhoto(request(), {
        storage,
        derive: derived,
        computeHash: explodingHash,
        photoHashes: { ...photoHashes, findMatchesFromOtherPublishers: findSpy },
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(RejectedUploadError);
      expect((failure as RejectedUploadError).violations).toEqual(["hash.unableToCompute"]);
      expect(findSpy).not.toHaveBeenCalled();
      expect(derived).not.toHaveBeenCalled();
      expect(storage.removed).toEqual([INCOMING_KEY]);
    });

    it("never records — recording is the caller's job, after its own row exists", async () => {
      const storage = makeStorage();
      const photoHashes = noMatchPhotoHashes();

      await processUploadedPhoto(request(), { storage, derive, computeHash, photoHashes });

      expect(photoHashes.recorded).toEqual([]);
    });
  });
});
