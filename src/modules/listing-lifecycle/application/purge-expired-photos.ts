import { PURGE_GRACE_DAYS } from "../domain/expiry";
import type { JobRunPort } from "./ports/job-run.port";
import type { ListingPhotoPurgePort } from "./ports/listing-photo-purge.port";

/**
 * La purga de fotos (19c, tarea 19.4).
 *
 * **Borra las fotos y deja el aviso.** No es una restricción que este archivo
 * respete por buena voluntad: `ListingPhotoPurgePort` no tiene con qué tocar
 * la fila del aviso ni su estado. 19c cerró la pregunta con los números al
 * lado — las fotos son prácticamente el 100% del peso en R2 y una fila de
 * aviso pesa ~600 bytes en Postgres — así que borrar la fila no libera nada y
 * cuesta la URL indexada, el estado vencido que el diseño dibuja y la
 * evidencia de la métrica, que además `contact_reveal_event` bloquea a nivel
 * de base con `ON DELETE restrict`.
 *
 * **Esto es lo que el segundo correo anuncia.** La regla «no podemos borrar
 * data real» habla de migraciones que destruyen en silencio; ésta es una
 * política de retención deliberada y avisada por dos canales (19.8). El aviso
 * es lo que las hace cosas distintas, y por eso el correo de purga no es un
 * extra opcional.
 */

export interface PurgeResult {
  readonly selected: number;
  readonly photosDeleted: number;
  readonly objectsRemoved: number;
  readonly failed: number;
}

/** Sólo lo que la purga necesita de R2: quitar un objeto. */
export interface PurgeObjectStoragePort {
  remove(key: string): Promise<void>;
}

export interface PurgeDependencies {
  readonly photos: ListingPhotoPurgePort;
  readonly objectStorage: PurgeObjectStoragePort;
  readonly jobRuns: JobRunPort;
  readonly now?: () => Date;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_FAILURE_DETAIL = 2000;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function purgeExpiredPhotos(dependencies: PurgeDependencies): Promise<PurgeResult> {
  const { photos, objectStorage, jobRuns } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();

  const purgeBefore = new Date(startedAt.getTime() - PURGE_GRACE_DAYS * MILLISECONDS_PER_DAY);
  const candidates = await photos.candidates(purgeBefore);

  const failures: string[] = [];
  let objectsRemoved = 0;
  let photosDeleted = 0;

  for (const candidate of candidates) {
    // El bucket primero. Al revés, la fila que sabe qué objetos existen ya no
    // está, y esos bytes quedan pagados para siempre — que es justamente lo
    // que la retención existe para evitar.
    for (const key of candidate.objectKeys) {
      try {
        await objectStorage.remove(key);
        objectsRemoved += 1;
      } catch (error) {
        failures.push(`${key}: ${describeError(error)}`);
      }
    }

    // Se borran las filas AUNQUE algún objeto haya fallado. Un objeto que ya
    // no está en R2 falla al borrarse y el resultado buscado —que no queden
    // bytes— ya se cumplió: dejar la fila sólo garantiza reintentar lo mismo
    // todos los días. La falla queda anotada en `job_run` para poder mirarla.
    try {
      photosDeleted += await photos.deletePhotos(candidate.photoIds);
    } catch (error) {
      failures.push(`${candidate.listingId}: ${describeError(error)}`);
    }
  }

  await jobRuns.record({
    job: "photo-purge",
    startedAt,
    finishedAt: now(),
    selected: candidates.length,
    succeeded: photosDeleted,
    skipped: 0,
    failed: failures.length,
    failureDetail: failures.length === 0 ? null : failures.join("\n").slice(0, MAX_FAILURE_DETAIL),
  });

  return { selected: candidates.length, photosDeleted, objectsRemoved, failed: failures.length };
}
