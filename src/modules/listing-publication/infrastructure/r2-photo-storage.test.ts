import type { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { MAX_PHOTO_BYTES } from "../domain/uploaded-photo";
import {
  DERIVATIVE_CONTENT_TYPE,
  InvalidUploadRequestError,
  PRESIGNED_UPLOAD_TTL_SECONDS,
  R2PhotoStorage,
  readR2Config,
  type S3Command,
  type S3Like,
} from "./r2-photo-storage";

/**
 * Task 3.7, design.md's security table: "Key derived server-side with a
 * per-account prefix; short TTL; `content-length-range`; fixed content-type.
 * RED test: client-supplied key rejected; oversized PUT rejected."
 *
 * **Nothing here touches a network.** The S3 client and the presigner are
 * injected, so these tests assert the only thing the adapter actually
 * decides: which command it builds, with which parameters. A test that needed
 * a real bucket would prove the SDK works rather than that our key derivation
 * refuses a traversal — and it would be skipped in CI, which is how a
 * security check quietly stops running.
 */

const CONFIG = {
  bucket: "rentas-photos",
  endpoint: "https://abc123.r2.cloudflarestorage.com",
  publicBaseUrl: "https://pub-abc123.r2.dev",
  accountId: "abc123",
  accessKeyId: "access-key",
  secretAccessKey: "secret-key",
} as const;

const NOW = new Date("2026-08-16T12:00:00.000Z");

class RecordingS3 implements S3Like {
  readonly sent: S3Command[] = [];

  constructor(private readonly reply: (command: S3Command) => unknown = () => ({})) {}

  async send(command: S3Command): Promise<unknown> {
    this.sent.push(command);
    const outcome = this.reply(command);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }
}

function makeStorage(client: S3Like = new RecordingS3()) {
  const signed: { command: PutObjectCommand; options: { expiresIn: number } }[] = [];
  let issued = 0;

  const storage = new R2PhotoStorage({
    client,
    config: CONFIG,
    presign: async (command, options) => {
      signed.push({ command, options });
      return "https://abc123.r2.cloudflarestorage.com/signed";
    },
    now: () => NOW,
    // Deterministic, so the key assertion is exact rather than a regex that
    // would also pass against a key with no random component at all.
    randomToken: () => {
      issued += 1;
      return `token${issued}`;
    },
  });

  return { storage, signed };
}

describe("R2PhotoStorage.createUploadTarget", () => {
  const request = { publisherId: "pub-42", contentType: "image/jpeg", maxBytes: MAX_PHOTO_BYTES };

  it("derives the key from the publisher id and a random component", async () => {
    const { storage } = makeStorage();

    expect((await storage.createUploadTarget(request)).key).toBe("incoming/pub-42/token1");
  });

  it("gives two uploads by the same publisher different keys", async () => {
    // Without the random component the second upload would silently overwrite
    // the first, which is a lost photo rather than an error.
    const { storage } = makeStorage();

    const first = await storage.createUploadTarget(request);
    const second = await storage.createUploadTarget(request);

    expect(first.key).not.toBe(second.key);
  });

  it.each([
    ["a traversal segment", "../other-publisher"],
    ["a path separator", "pub-42/../pub-99"],
    ["a backslash", "pub-42\\pub-99"],
    ["a percent-encoded separator", "pub-42%2Fpub-99"],
    ["an absolute path", "/etc/passwd"],
    ["nothing at all", ""],
  ])("refuses a publisher id carrying %s", async (_label, publisherId) => {
    const { storage, signed } = makeStorage();

    await expect(storage.createUploadTarget({ ...request, publisherId })).rejects.toThrow(
      InvalidUploadRequestError,
    );
    // Nothing was signed: the refusal happens before any grant is issued.
    expect(signed).toHaveLength(0);
  });

  it("signs the configured bucket and the derived key, never a caller-supplied one", async () => {
    const { storage, signed } = makeStorage();

    const target = await storage.createUploadTarget(request);

    expect(signed[0]?.command.input).toMatchObject({ Bucket: CONFIG.bucket, Key: target.key });
  });

  it("pins the content type into the signature", async () => {
    const { storage, signed } = makeStorage();

    await storage.createUploadTarget(request);

    expect(signed[0]?.command.input.ContentType).toBe("image/jpeg");
  });

  it("refuses a content type the derivative pipeline cannot decode", async () => {
    // `image/svg+xml` is a legitimate image MIME type and a script-executing
    // document; signing one publishes script from the public bucket.
    const { storage } = makeStorage();

    await expect(
      storage.createUploadTarget({ ...request, contentType: "image/svg+xml" }),
    ).rejects.toThrow(InvalidUploadRequestError);
  });

  it("pins the exact byte length when the caller declares one", async () => {
    const { storage, signed } = makeStorage();

    await storage.createUploadTarget({ ...request, byteLength: 1_234 });

    expect(signed[0]?.command.input.ContentLength).toBe(1_234);
  });

  it("refuses a declared length above the ceiling instead of signing it", async () => {
    const { storage, signed } = makeStorage();

    await expect(
      storage.createUploadTarget({ ...request, byteLength: MAX_PHOTO_BYTES + 1 }),
    ).rejects.toThrow(InvalidUploadRequestError);
    expect(signed).toHaveLength(0);
  });

  it("expires the grant after the short TTL and says when", async () => {
    const { storage, signed } = makeStorage();

    const target = await storage.createUploadTarget(request);

    expect(signed[0]?.options.expiresIn).toBe(PRESIGNED_UPLOAD_TTL_SECONDS);
    expect(target.expiresAt).toEqual(new Date(NOW.getTime() + PRESIGNED_UPLOAD_TTL_SECONDS * 1000));
  });

  it("reaches no network to hand out a target", async () => {
    const client = new RecordingS3();
    const { storage } = makeStorage(client);

    await storage.createUploadTarget(request);

    expect(client.sent).toHaveLength(0);
  });
});

describe("R2PhotoStorage.read", () => {
  it("returns the stored bytes for the requested key", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const client = new RecordingS3(() => ({
      ContentLength: bytes.byteLength,
      Body: { transformToByteArray: async () => bytes },
    }));
    const { storage } = makeStorage(client);

    await expect(storage.read("incoming/pub-42/token1")).resolves.toEqual(bytes);
    expect((client.sent[0] as GetObjectCommand).input).toMatchObject({
      Bucket: CONFIG.bucket,
      Key: "incoming/pub-42/token1",
    });
  });

  it("refuses an oversized object without downloading it", async () => {
    // The compensating control for the bound a presigned PUT cannot carry.
    // Buffering the body first would be the exact exhaustion this prevents.
    const transformToByteArray = vi.fn(async () => new Uint8Array(0));
    const { storage } = makeStorage(
      new RecordingS3(() => ({
        ContentLength: MAX_PHOTO_BYTES + 1,
        Body: { transformToByteArray },
      })),
    );

    await expect(storage.read("incoming/pub-42/token1")).rejects.toThrow(/too large/i);
    expect(transformToByteArray).not.toHaveBeenCalled();
  });
});

describe("R2PhotoStorage.put", () => {
  it("stores a derivative and reports its measured size", async () => {
    const client = new RecordingS3();
    const { storage } = makeStorage(client);

    const stored = await storage.put(
      "listings/l1/detail.webp",
      new Uint8Array([1, 2, 3, 4]),
      DERIVATIVE_CONTENT_TYPE,
    );

    expect(stored).toEqual({ key: "listings/l1/detail.webp", byteLength: 4 });
    expect((client.sent[0] as PutObjectCommand).input).toMatchObject({
      Bucket: CONFIG.bucket,
      Key: "listings/l1/detail.webp",
      ContentType: DERIVATIVE_CONTENT_TYPE,
      ContentLength: 4,
    });
  });

  it("refuses to store anything that is not a derivative (D12)", async () => {
    // Task 3.10 left this half here on purpose: the derivation step cannot
    // hand the original onward, and the adapter must not accept it either.
    const client = new RecordingS3();
    const { storage } = makeStorage(client);

    await expect(
      storage.put("listings/l1/original", new Uint8Array([1]), "image/jpeg"),
    ).rejects.toThrow(/D12/);
    expect(client.sent).toHaveLength(0);
  });
});

describe("R2PhotoStorage.remove", () => {
  it("deletes the object from the configured bucket", async () => {
    const client = new RecordingS3();
    const { storage } = makeStorage(client);

    await storage.remove("incoming/pub-42/token1");

    expect((client.sent[0] as DeleteObjectCommand).input).toMatchObject({
      Bucket: CONFIG.bucket,
      Key: "incoming/pub-42/token1",
    });
  });

  it("lets a failed delete surface instead of swallowing it", async () => {
    // D12 is a storage-budget requirement, not housekeeping: a delete that
    // fails quietly caps the catalogue at ~330 listings instead of ~7,000.
    const { storage } = makeStorage(new RecordingS3(() => new Error("R2 unavailable")));

    await expect(storage.remove("incoming/pub-42/token1")).rejects.toThrow("R2 unavailable");
  });
});

describe("R2PhotoStorage.publicUrlFor", () => {
  it("joins the public base and the key without doubling the separator", async () => {
    const { storage } = makeStorage();

    expect(storage.publicUrlFor("listings/l1/detail.webp")).toBe(
      `${CONFIG.publicBaseUrl}/listings/l1/detail.webp`,
    );
  });
});

describe("readR2Config", () => {
  const ENV = {
    R2_BUCKET: CONFIG.bucket,
    R2_BUCKET_URL: CONFIG.endpoint,
    R2_BUCKET_PUBLIC_URL: CONFIG.publicBaseUrl,
    R2_BUCKET_ACCOUNT_ID: CONFIG.accountId,
    R2_BUCKET_ACCESS_KEY: CONFIG.accessKeyId,
    R2_BUCKET_SECRET_KEY: CONFIG.secretAccessKey,
  };

  it("reads exactly the six variables the founder named", () => {
    expect(readR2Config(ENV)).toEqual(CONFIG);
  });

  it("names the variable that is missing", () => {
    expect(() => readR2Config({ ...ENV, R2_BUCKET_SECRET_KEY: undefined })).toThrow(
      /R2_BUCKET_SECRET_KEY/,
    );
  });

  /**
   * **El bug que costó un día, y que no fallaba: corrompía.**
   *
   * Con el bucket puesto DENTRO del endpoint, el SDK arma
   * `endpoint + /bucket + /clave`, así que R2 recibe el nombre dos veces: lee
   * el primero como bucket y **el segundo pasa a ser parte de la clave**. Cada
   * subida termina en `rentas-photos/photos/…` mientras la base guarda
   * `photos/…`, y el objeto queda a un lugar de distancia de donde toda
   * pantalla lo busca.
   *
   * No lanza ningún error en ningún lado. Sube bien, se guarda bien, y la foto
   * da 404 para siempre. Por eso esto es una guarda de arranque y no una nota:
   * es exactamente el mismo razonamiento que ya justifica el cruce con
   * `R2_BUCKET_ACCOUNT_ID` unas líneas más abajo.
   */
  it("refuses an endpoint carrying the bucket in its path", () => {
    expect(() =>
      readR2Config({ ...ENV, R2_BUCKET_URL: `${CONFIG.endpoint}/${CONFIG.bucket}` }),
    ).toThrow(/R2_BUCKET_URL/);
  });

  it("refuses an endpoint with any path at all, not only the bucket name", () => {
    // La ruta entera es el problema, no la palabra: cualquier segmento se
    // antepone a la clave igual.
    expect(() =>
      readR2Config({ ...ENV, R2_BUCKET_URL: `${CONFIG.endpoint}/cualquier-cosa` }),
    ).toThrow(/R2_BUCKET_URL/);
  });

  it("accepts an endpoint whose path is just a trailing slash", () => {
    // Una barra final es una forma de escribir el origen, no una ruta.
    expect(readR2Config({ ...ENV, R2_BUCKET_URL: `${CONFIG.endpoint}/` }).endpoint).toBe(
      `${CONFIG.endpoint}/`,
    );
  });

  it("refuses an endpoint that belongs to a different account", () => {
    // One credential pair pointed at the wrong Cloudflare account: otherwise
    // a 403 at the first publisher's first upload, in production.
    expect(() =>
      readR2Config({ ...ENV, R2_BUCKET_URL: "https://someone-else.r2.cloudflarestorage.com" }),
    ).toThrow(/R2_BUCKET_ACCOUNT_ID/);
  });
});
