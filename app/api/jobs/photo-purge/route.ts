import { purgeExpiredPhotos } from "../../../../src/modules/listing-lifecycle/application/purge-expired-photos";
import { isAuthorizedJobRequest } from "../../../../src/modules/listing-lifecycle/domain/cron-authorization";
import {
  DrizzleJobRuns,
  DrizzleListingPhotoPurge,
  type LifecycleDatabase,
} from "../../../../src/modules/listing-lifecycle/infrastructure/drizzle-lifecycle";
import { readCronSecret } from "../../../../src/modules/listing-lifecycle/infrastructure/lifecycle-config";
import { createR2PhotoStorage } from "../../../../src/modules/listing-publication/infrastructure/r2-photo-storage";
import { db } from "../../../../src/shared/db/client";

/**
 * La purga de fotos de los avisos vencidos hace más de 15 días (19.4).
 *
 * Misma puerta que el otro trabajo y ninguna regla propia. Lo que borra y lo
 * que NO borra lo decide `purgeExpiredPhotos`, sobre un puerto que no tiene
 * con qué tocar la fila del aviso.
 *
 * **SIGUE SIN ESTAR EN `vercel.json`, y ahora por otra razón.** El bloqueo
 * técnico se levantó el 2026-08-24: `ResendLifecycleMailer` entró con 7.11 y
 * el aviso de purga YA sale por correo de verdad. Lo que 19.8 pedía —que lo
 * que separa esta retención de un borrado silencioso sea el aviso— está
 * cumplido.
 *
 * Lo que falta es una decisión, no código. Programar esto empieza a **borrar
 * fotos reales de forma irreversible** todos los días, así que el cron lo
 * agrega el fundador cuando quiera, no un agente porque el bloqueo se cayó.
 * Antes de programarlo conviene mirar 19.5 y comprobar contra datos reales
 * que la anticipación de 5 días alcanza para que alguien reaccione.
 */

export const dynamic = "force-dynamic";

async function run(request: Request): Promise<Response> {
  if (!isAuthorizedJobRequest(request.headers.get("authorization"), readCronSecret())) {
    return Response.json({ error: "unauthorized", photos_deleted: 0 }, { status: 401 });
  }

  const handle = db as unknown as LifecycleDatabase;
  const result = await purgeExpiredPhotos({
    photos: new DrizzleListingPhotoPurge(handle),
    objectStorage: createR2PhotoStorage(),
    jobRuns: new DrizzleJobRuns(handle),
  });

  return Response.json({
    photos_deleted: result.photosDeleted,
    objects_removed: result.objectsRemoved,
    selected: result.selected,
    failed: result.failed,
  });
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}

/** El cron de Vercel dispara `GET`; el portador es el mismo. */
export async function GET(request: Request): Promise<Response> {
  return run(request);
}
