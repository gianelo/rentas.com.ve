import { randomBytes } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  CreateUploadTargetRequest,
  PhotoStoragePort,
  StoredObject,
  UploadTarget,
} from "../application/ports/photo-storage.port";
import { MAX_PHOTO_BYTES, SUPPORTED_PHOTO_CONTENT_TYPES } from "../domain/uploaded-photo";

/**
 * Cloudflare R2 implementation of `PhotoStoragePort` (design.md D2, D12). R2
 * speaks the S3 API, so the AWS SDK is the client — and nothing above this
 * file knows that, which is the point of the port.
 *
 * The S3 client and the presigner are both injected. That is a testability
 * decision with a security consequence: every rule in design.md's security
 * table becomes assertable without a bucket, a credential or a network, so
 * the checks run on every push instead of being skipped in CI — which is how
 * a security check quietly stops running.
 *
 * ## Where this departs from design.md, and why
 *
 * The security table asks for a `content-length-range` on the presigned PUT.
 * **That is not expressible.** `content-length-range` is a condition of a
 * POST *policy*, and R2's S3 compatibility list does not implement `POST
 * Object` at all — so it is unavailable twice over. A SigV4 presigned PUT can
 * only pin a header to an exact value it already signed.
 *
 * What ships instead is stronger where it applies and honest where it is not:
 * when the caller declares the file's size — the browser knows it before the
 * upload starts — `ContentLength` is signed exactly, so a body of any other
 * length fails the signature at R2's edge. When it does not, `read` refuses
 * an oversized object **without downloading it**, which costs one metadata
 * read rather than a serverless function's memory.
 *
 * **OPEN QUESTION for the founder:** the publish route should make the
 * declared size mandatory, so the second path is only ever a backstop.
 */

/**
 * Five minutes. **This number is chosen here, not inherited from the
 * design**, which says only "short TTL". SigV4 checks validity when the
 * request starts, not when it finishes, so this bounds how long a publisher
 * may take to *begin* an upload, not how long a slow connection may take to
 * finish one. Five minutes covers picking a photo out of a phone gallery on a
 * bad day; longer only widens the window in which a URL leaked through a log,
 * a screenshot or a browser history is still a write grant.
 */
export const PRESIGNED_UPLOAD_TTL_SECONDS = 300;

/**
 * Uploads land under a temporary prefix (design.md's publish data flow: "R2
 * (temp prefix)") and are promoted only once the duplicate check clears. The
 * publisher's own id is the second segment, which is what makes one account's
 * leaked URL useless for writing into another's space.
 */
const INCOMING_PREFIX = "incoming";

/**
 * An allowlist rather than a blocklist. A blocklist has to anticipate `..`,
 * `/`, `\`, `%2F`, `%252F`, unicode separators and whatever the next decade
 * of path-parsing bugs invents, and it only has to be wrong once. The ids
 * this project actually issues are Auth.js cuid/uuid values, which fit.
 */
const PUBLISHER_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * D12 keeps derivatives and discards originals, and `deriveListingPhoto`
 * emits WebP for both. Refusing every other type makes "the adapter stored
 * the original anyway" a loud failure rather than a silent 30 MB per listing
 * — the half of D12 that task 3.10 explicitly left to this file.
 */
export const DERIVATIVE_CONTENT_TYPE = "image/webp";

export class InvalidUploadRequestError extends Error {
  constructor(message: string) {
    super(`r2-photo-storage: ${message}`);
    this.name = "InvalidUploadRequestError";
  }
}

export interface R2Config {
  readonly bucket: string;
  readonly endpoint: string;
  readonly publicBaseUrl: string;
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export type S3Command = GetObjectCommand | PutObjectCommand | DeleteObjectCommand;

/** The slice of `S3Client` this adapter uses, so a test can stand in for it. */
export interface S3Like {
  send(command: S3Command): Promise<unknown>;
}

export type PresignPut = (
  command: PutObjectCommand,
  options: { expiresIn: number; signableHeaders: Set<string> },
) => Promise<string>;

export interface R2PhotoStorageDependencies {
  readonly client: S3Like;
  readonly config: R2Config;
  readonly presign: PresignPut;
  readonly now?: () => Date;
  readonly randomToken?: () => string;
}

/** Only the fields `read` needs; the SDK's own output type carries dozens. */
interface GetObjectResult {
  readonly ContentLength?: number;
  readonly Body?: { transformToByteArray(): Promise<Uint8Array> };
}

/**
 * Additive to the port rather than a change to it: a declared size upgrades
 * the byte ceiling from a post-hoc check to a signed constraint, and a caller
 * that knows only the port still type-checks.
 */
export type CreateUploadTargetInput = CreateUploadTargetRequest & {
  readonly byteLength?: number;
};

export class R2PhotoStorage implements PhotoStoragePort {
  private readonly client: S3Like;
  private readonly config: R2Config;
  private readonly presign: PresignPut;
  private readonly now: () => Date;
  private readonly randomToken: () => string;

  constructor(dependencies: R2PhotoStorageDependencies) {
    this.client = dependencies.client;
    this.config = dependencies.config;
    this.presign = dependencies.presign;
    this.now = dependencies.now ?? (() => new Date());
    // 16 random bytes: the key is reachable through a URL handed to a
    // browser, and a guessable one lets a publisher's pending upload be
    // overwritten by somebody else's.
    this.randomToken = dependencies.randomToken ?? (() => randomBytes(16).toString("hex"));
  }

  async createUploadTarget(request: CreateUploadTargetInput): Promise<UploadTarget> {
    const key = this.deriveKey(request.publisherId);
    const contentType = request.contentType.split(";")[0]?.trim().toLowerCase() ?? "";

    // Pinned into the signature, so an unvetted value here is a signed grant
    // to publish that type from a public bucket — and `image/svg+xml` is both
    // a legitimate image MIME type and a document that executes script.
    if (!(SUPPORTED_PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      throw new InvalidUploadRequestError(
        `content type ${contentType || "(empty)"} is not accepted`,
      );
    }

    // The caller's ceiling never raises ours: `MAX_PHOTO_BYTES` and this
    // signature are the two halves of one limit and must move together.
    const ceiling = Math.min(request.maxBytes, MAX_PHOTO_BYTES);
    const declared = request.byteLength;
    if (declared !== undefined && (declared <= 0 || declared > ceiling)) {
      throw new InvalidUploadRequestError(`declared length ${declared} is outside 1..${ceiling}`);
    }

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: declared,
    });

    const url = await this.presign(command, {
      expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
      // Naming a header here puts it in `X-Amz-SignedHeaders`, which is what
      // makes its value binding: a request carrying a different content type
      // or length fails the signature instead of succeeding with something
      // this application never authorised.
      signableHeaders: new Set(["content-type", "content-length"]),
    });

    return {
      key,
      url,
      expiresAt: new Date(this.now().getTime() + PRESIGNED_UPLOAD_TTL_SECONDS * 1000),
    };
  }

  async read(key: string): Promise<Uint8Array> {
    const result = (await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    )) as GetObjectResult;

    // Checked before the body is touched: `ContentLength` arrives with the
    // response metadata, whereas refusing after `transformToByteArray` would
    // mean the oversized payload already sat in a serverless function's fixed
    // memory. This is the compensating control for the range the presigned
    // PUT cannot carry.
    if (result.ContentLength !== undefined && result.ContentLength > MAX_PHOTO_BYTES) {
      throw new InvalidUploadRequestError(
        `object ${key} is too large: ${result.ContentLength} bytes exceeds ${MAX_PHOTO_BYTES}`,
      );
    }

    if (!result.Body) throw new Error(`r2-photo-storage: object ${key} returned no body`);

    return result.Body.transformToByteArray();
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
    if (contentType !== DERIVATIVE_CONTENT_TYPE) {
      throw new InvalidUploadRequestError(
        `refusing to store ${contentType}: D12 keeps only ${DERIVATIVE_CONTENT_TYPE} derivatives, ` +
          "and the original is discarded after hashing",
      );
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        ContentLength: bytes.byteLength,
      }),
    );

    // Measured locally rather than read back: this number lands in
    // `listing_photo`'s byte-size column, and a second request to learn what
    // we just wrote would spend a Class A operation for nothing.
    return { key, byteLength: bytes.byteLength };
  }

  async remove(key: string): Promise<void> {
    // Deliberately outside any try/catch. D12 is a storage-budget requirement
    // with a number attached (~330 listings retained versus ~7,000
    // discarded), so a delete that fails quietly is a product failure nothing
    // would ever report.
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  /**
   * Where a stored derivative is readable from — the only consumer of
   * `R2_BUCKET_PUBLIC_URL`, which is an `r2.dev` subdomain today and a custom
   * domain later, swapped in the environment without touching this file. Not
   * on the port: the publish use case has no need for it, the render layer
   * does.
   */
  publicUrlFor(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }

  private deriveKey(publisherId: string): string {
    if (!PUBLISHER_ID_PATTERN.test(publisherId)) {
      throw new InvalidUploadRequestError(
        `publisher id ${JSON.stringify(publisherId)} is not a valid identifier`,
      );
    }

    return `${INCOMING_PREFIX}/${publisherId}/${this.randomToken()}`;
  }
}

/**
 * The six variable names are the founder's, read here and nowhere else.
 * `R2_BUCKET_ACCOUNT_ID` is redundant with the endpoint's own hostname, which
 * is exactly why it earns its keep: cross-checking the two turns "credentials
 * pointed at the wrong Cloudflare account" into a startup error rather than a
 * 403 at the first publisher's first upload.
 */
export function readR2Config(env: Record<string, string | undefined> = process.env): R2Config {
  const required = [
    "R2_BUCKET",
    "R2_BUCKET_URL",
    "R2_BUCKET_PUBLIC_URL",
    "R2_BUCKET_ACCOUNT_ID",
    "R2_BUCKET_ACCESS_KEY",
    "R2_BUCKET_SECRET_KEY",
  ] as const;

  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`r2-photo-storage: missing environment variables: ${missing.join(", ")}`);
  }

  const config: R2Config = {
    bucket: env.R2_BUCKET as string,
    endpoint: env.R2_BUCKET_URL as string,
    publicBaseUrl: env.R2_BUCKET_PUBLIC_URL as string,
    accountId: env.R2_BUCKET_ACCOUNT_ID as string,
    accessKeyId: env.R2_BUCKET_ACCESS_KEY as string,
    secretAccessKey: env.R2_BUCKET_SECRET_KEY as string,
  };

  const endpoint = new URL(config.endpoint);

  /**
   * **El endpoint es un origen, no una ruta — y esto no falla, corrompe.**
   *
   * El SDK de S3 arma `endpoint + /bucket + /clave`. Con el bucket ya escrito
   * dentro del endpoint, R2 recibe el nombre DOS veces: lee el primero como
   * bucket y **el segundo pasa a ser el principio de la clave**. Cada subida
   * termina en `rentas-photos/photos/…` mientras `listing_photo_derivative`
   * guarda `photos/…`, y el objeto queda a un segmento de distancia de donde
   * toda pantalla lo busca.
   *
   * Nada lanza. Sube bien, se guarda bien, y la foto da 404 para siempre. Nos
   * pasó el 2026-08-22 con las 180 derivadas de la demo, y sólo se encontró
   * comparando lo que la base decía contra lo que R2 tenía. Por eso es una
   * guarda de arranque: mismo razonamiento que el cruce con
   * `R2_BUCKET_ACCOUNT_ID` de abajo — convertir una configuración equivocada
   * en un error visible en vez de un 404 silencioso.
   */
  if (endpoint.pathname !== "/" && endpoint.pathname !== "") {
    throw new Error(
      `r2-photo-storage: R2_BUCKET_URL (${config.endpoint}) carries a path. ` +
        "It must be the account origin only — the bucket goes in R2_BUCKET, and a path here " +
        "is prepended to every object key, so uploads land where nothing reads them.",
    );
  }

  // `startsWith` rather than an exact hostname: R2's jurisdiction-specific
  // endpoints (`<account>.eu.r2.cloudflarestorage.com`) are legitimate, and an
  // exact match would reject them.
  if (!endpoint.hostname.startsWith(`${config.accountId}.`)) {
    throw new Error(
      `r2-photo-storage: R2_BUCKET_URL (${config.endpoint}) does not belong to ` +
        `R2_BUCKET_ACCOUNT_ID (${config.accountId})`,
    );
  }

  return config;
}

/**
 * Composition root. `region: "auto"` is R2's only accepted value — it has no
 * regions in the S3 sense, but SigV4 requires one in the signature.
 */
export function createR2PhotoStorage(
  env: Record<string, string | undefined> = process.env,
): R2PhotoStorage {
  const config = readR2Config(env);
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  return new R2PhotoStorage({
    client,
    config,
    presign: (command, options) => getSignedUrl(client, command, options),
  });
}
