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
 * **YA ESTÁ EN `vercel.json`, a las `0 17 * * *`** (19.4). Estuvo ausente a
 * propósito hasta el 2026-09-02, esperando que la política estuviera
 * anunciada; hoy lo está por los dos canales que la 19.8 exige —el segundo
 * correo (19.5) y el conteo regresivo de `/mis-avisos` (19.6)— y sobre
 * exactamente los mismos estados que esta purga alcanza (19.16). Mientras
 * tanto el producto prometía un borrado que nadie ejecutaba, que es peor que
 * cualquiera de las dos mitades por separado.
 *
 * **Las 17:00 UTC son cuatro horas después del trabajo de recordatorios.** El
 * plan Hobby corre cada cron una vez por día con ±59 minutos de deriva, así
 * que esa distancia sobra para que `markExpired` y el correo del día 40 hayan
 * salido antes de que se borre nada, y para que una caída de uno no se lea
 * como la del otro en `job_run`.
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
