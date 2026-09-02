import type { PhotoHashPort } from "../../listing-trust/application/ports/photo-hash.port";
import { MAX_DUPLICATE_HAMMING_DISTANCE } from "../../listing-trust/domain/hamming-distance";
import type { PerceptualHash } from "../../listing-trust/domain/perceptual-hash";
import { inspectUploadedPhoto, type UploadViolation } from "../domain/uploaded-photo";
import type { DerivativeName, PhotoDerivationPort } from "./ports/photo-derivation.port";
import type { PhotoHashComputationPort } from "./ports/photo-hash-computation.port";
import type { PhotoStoragePort } from "./ports/photo-storage.port";

/**
 * The step between "the browser finished its presigned PUT" and "a row is
 * written" — task 3.7's "upload guard before persistence".
 *
 * A separate step rather than part of the publish use case, because the
 * broker importer (Phase 9) uploads photos in a second phase with no publish
 * form anywhere near it. The bytes never pass through this application on
 * their way to R2 — the whole point of a presigned PUT — so this is the FIRST
 * and ONLY moment anything of ours can look at them, and FOUR guarantees
 * have nowhere else to live:
 *
 * 1. The object belongs to the publisher claiming it.
 * 2. The bytes are the image they claim to be (`inspectUploadedPhoto`).
 * 3. The photo does not perceptually match another publisher's — design.md
 *    D4, task 4.7. Checked here, not recorded here: `listing_photo_hash`'s
 *    own primary key references `listing_photo.id`, so the row this hash
 *    belongs to does not exist yet at this point in either caller
 *    (`publishListing`, `attachPhotoToDraft`). Both record the returned
 *    `hash` themselves, AFTER their own listing/photo row is written —
 *    recording it here, before that row exists, would also risk poisoning
 *    the table against this same publisher if the surrounding submission
 *    were then rejected for an unrelated reason.
 * 4. The original is discarded once the derivatives exist (D12) — and now
 *    also whenever a photo is refused for 1-3, so a rejected upload never
 *    lingers in the incoming prefix either.
 *
 * **Fail closed (task 4.7).** A photo whose hash cannot be computed is
 * refused outright, exactly like an unowned key or a byte-level violation —
 * never silently accepted as if nothing had been checked.
 */

/**
 * `key.notOwnedByPublisher` sits alongside the byte-level violations so a
 * caller handling failures need not know which layer refused. One code covers
 * every malformed-key case on purpose: a publisher who submitted a key they
 * were never given does not need to know which part of it was wrong, and an
 * attacker probing the parser should not be told either.
 */
export type PhotoRejection =
  | UploadViolation
  | "key.notOwnedByPublisher"
  | "hash.unableToCompute"
  | "photo.duplicateAcrossPublishers";

export class RejectedUploadError extends Error {
  readonly violations: readonly PhotoRejection[];

  constructor(violations: readonly PhotoRejection[], options?: { cause?: unknown }) {
    super(`process-uploaded-photo: rejected (${violations.join(", ")})`, options);
    this.name = "RejectedUploadError";
    this.violations = violations;
  }
}

export interface ProcessUploadedPhotoRequest {
  /** From the session, never from the request body. */
  readonly publisherId: string;
  /** The key `createUploadTarget` issued — the client echoes it back. */
  readonly incomingKey: string;
  /** What the browser claimed. Checked against the header, never trusted. */
  readonly declaredContentType: string;
}

export interface ProcessUploadedPhotoDependencies {
  readonly storage: PhotoStoragePort;
  readonly derive: PhotoDerivationPort;
  readonly computeHash: PhotoHashComputationPort;
  /**
   * Narrowed to the read half only — this function checks, it never
   * records. Recording is the caller's job, after the caller's own
   * `listing_photo` row exists (see the class docstring above and
   * `PhotoHashPort.record`'s own doc).
   */
  readonly photoHashes: Pick<PhotoHashPort, "findMatchesFromOtherPublishers">;
}

/**
 * Una fila por derivada, con su clave y su tamaño medido.
 *
 * **Eran cuatro campos planos para dos derivadas fijas; ahora son cinco filas.**
 * El cambio no es cosmético: agregar un sexto tamaño mañana ya no toca esta
 * forma ni el esquema, y los bytes se siguen guardando por derivada porque el
 * presupuesto de D12 tiene que ser auditable contra filas reales de producción
 * — `SELECT max(bytes) FROM listing_photo_derivative` es una pregunta que la
 * suite de tests no puede contestar, porque sólo ve fixtures.
 */
export interface ProcessedDerivative {
  readonly name: DerivativeName;
  readonly key: string;
  readonly byteLength: number;
}

export interface ProcessedPhoto {
  readonly derivatives: readonly ProcessedDerivative[];
  /**
   * design.md D4 — computed once, here, and handed back rather than
   * recomputed downstream. The caller records it verbatim after its own
   * listing/photo row exists; see the class docstring for why recording
   * cannot happen in this function.
   */
  readonly hash: PerceptualHash;
}

/** Matches `R2PhotoStorage`'s own `INCOMING_PREFIX` and its 16-byte token. */
const INCOMING_PREFIX = "incoming";
const PROMOTED_PREFIX = "photos";
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

/** The port refuses anything else, and D12 is why. */
const DERIVATIVE_CONTENT_TYPE = "image/webp";

/**
 * Recovers the random token from a key this application issued, or `null`.
 *
 * The publisher id is compared, not merely parsed, and that comparison is the
 * security property: without it a publisher could submit
 * `incoming/<someone-else>/<token>` and this function would download, derive,
 * promote and then DELETE another account's pending photo. The key is not a
 * secret — it travels to the browser — so nothing else stops that.
 *
 * Exact segments rather than `startsWith`, because a prefix test accepts
 * `incoming/<publisher>/../elsewhere`.
 */
function tokenFromOwnedKey(incomingKey: string, publisherId: string): string | null {
  const segments = incomingKey.split("/");
  if (segments.length !== 3) return null;

  const [prefix, owner, token] = segments;
  if (prefix !== INCOMING_PREFIX || owner !== publisherId) return null;
  if (!TOKEN_PATTERN.test(token as string)) return null;

  return token as string;
}

/**
 * Best-effort cleanup on a failure path. Attempted because an abandoned
 * object costs storage against the tier that decides how many listings fit
 * (D12) and nothing sweeps the incoming prefix — but its own failure must not
 * replace the reason the upload was refused. A publisher told "r2
 * unavailable" instead of "that file is not an image" cannot act on it, so
 * the storage error is carried as `cause` rather than thrown.
 */
async function discardQuietly(storage: PhotoStoragePort, key: string): Promise<unknown> {
  try {
    await storage.remove(key);
    return undefined;
  } catch (error) {
    return error;
  }
}

export async function processUploadedPhoto(
  request: ProcessUploadedPhotoRequest,
  { storage, derive, computeHash, photoHashes }: ProcessUploadedPhotoDependencies,
): Promise<ProcessedPhoto> {
  const token = tokenFromOwnedKey(request.incomingKey, request.publisherId);

  // Before the read, and before any cleanup: an unowned key must not be
  // downloaded, and must certainly not be deleted on a stranger's behalf.
  if (token === null) {
    throw new RejectedUploadError(["key.notOwnedByPublisher"]);
  }

  const source = await storage.read(request.incomingKey);

  const violations = inspectUploadedPhoto(source, request.declaredContentType);
  if (violations.length > 0) {
    const cleanupFailure = await discardQuietly(storage, request.incomingKey);
    throw new RejectedUploadError(violations, { cause: cleanupFailure });
  }

  // design.md D4 — computed and checked BEFORE deriving or promoting
  // anything, on purpose: deriving five WebP sizes and uploading them is
  // real work a photo already known stolen should never pay for.
  //
  // Fail closed (task 4.7's own requirement): a hash that cannot be
  // computed is not "no evidence of duplication" — it is refused outright,
  // the same way an unowned key or a byte-level violation already is.
  let hash: PerceptualHash;
  try {
    hash = await computeHash(source);
  } catch (error) {
    const cleanupFailure = await discardQuietly(storage, request.incomingKey);
    throw new RejectedUploadError(["hash.unableToCompute"], { cause: cleanupFailure ?? error });
  }

  const matches = await photoHashes.findMatchesFromOtherPublishers(
    hash,
    request.publisherId,
    MAX_DUPLICATE_HAMMING_DISTANCE,
  );
  if (matches.length > 0) {
    const cleanupFailure = await discardQuietly(storage, request.incomingKey);
    throw new RejectedUploadError(["photo.duplicateAcrossPublishers"], { cause: cleanupFailure });
  }

  let derivatives: Awaited<ReturnType<PhotoDerivationPort>>;
  try {
    derivatives = await derive(source);
  } catch (error) {
    // A file that survived the byte guard and still could not be decoded is
    // a decompression bomb or a corrupt image. Either way it is garbage that
    // outlives the request unless it is removed here.
    await discardQuietly(storage, request.incomingKey);
    throw error;
  }

  const base = `${PROMOTED_PREFIX}/${request.publisherId}/${token}`;
  // Las cinco en paralelo: son cinco PUT independientes contra R2 y hacerlas en
  // fila multiplicaría por cinco la latencia de publicar una foto, que es el
  // paso más lento del formulario.
  //
  // **`allSettled` y no `all`, y ahí está la tarea 18.39.** Con `all`, la que
  // rechaza hace lanzar a esta función ANTES de devolver nada, así que las otras
  // cuatro quedan escritas bajo `photos/` y ningún llamador se entera de que
  // existen: la limpieza de la 18.35 recorre FOTOS y junta lo que ESTA función
  // devuelve, de modo que no puede ver adentro de una sola. Y `photos/` es
  // también donde viven las derivadas de todos los avisos activos, así que
  // ninguna regla de ciclo de vida del bucket las separa; lo único que las
  // delata es la ausencia de su fila. Esperar a las cinco no serializa nada:
  // los cinco PUT siguen saliendo juntos.
  const names = Object.keys(derivatives) as DerivativeName[];
  const settled = await Promise.allSettled(
    names.map(async (name) => {
      const put = await storage.put(
        `${base}/${name}.webp`,
        derivatives[name].bytes,
        DERIVATIVE_CONTENT_TYPE,
      );
      return { name, key: put.key, byteLength: put.byteLength };
    }),
  );

  const stored: ProcessedDerivative[] = [];
  // Envuelto, para distinguir «ninguna rechazó» de «rechazó con `undefined`».
  let firstFailure: { readonly reason: unknown } | null = null;
  for (const result of settled) {
    if (result.status === "fulfilled") stored.push(result.value);
    else firstFailure ??= { reason: result.reason };
  }

  if (firstFailure !== null) {
    // En fila y sin exigir, la disciplina de `discardQuietly`: una clave que R2
    // rechaza no deja sin intentar a las otras, y el motivo que quien publica
    // necesita leer es el del PUT que falló, nunca el del barrido.
    //
    // **El original NO se toca acá.** Es lo único con lo que se puede volver a
    // derivar —D12 no lo guarda en ningún otro lado— y borrarlo dejaría al
    // borrador dibujando una foto que ya no se puede publicar. Si nadie vuelve,
    // lo alcanza la retención del prefijo `incoming/` (18.23, 18.36).
    for (const derivative of stored) {
      await discardQuietly(storage, derivative.key);
    }
    throw firstFailure.reason;
  }

  // Al final, y sólo cuando las cinco existen. Borrar primero sería una
  // función más corta y perdería la foto cada vez que un PUT fallara.
  await storage.remove(request.incomingKey);

  return { derivatives: stored, hash };
}
