import { isAuthorizedJobRequest } from "../../../../src/modules/listing-lifecycle/domain/cron-authorization";
import { readCronSecret } from "../../../../src/modules/listing-lifecycle/infrastructure/lifecycle-config";
import { sweepExpiredDrafts } from "../../../../src/modules/listing-publication/application/sweep-expired-drafts";
import {
  DrizzleExpiredPublicationDrafts,
  DrizzlePublicationDraftStore,
  type PublicationDraftDatabase,
} from "../../../../src/modules/listing-publication/infrastructure/drizzle-publication-draft-store";
import { createR2PhotoStorage } from "../../../../src/modules/listing-publication/infrastructure/r2-photo-storage";
import { db } from "../../../../src/shared/db/client";

/**
 * El barrido de las 24 horas (tasks.md 18.32): «a las 24 horas se limpia una
 * publicación abandonada» (fundador, 2026-09-01).
 *
 * **Esta ruta no decide nada.** Misma puerta que los otros dos trabajos —
 * `isAuthorizedJobRequest`, comparación en tiempo constante y cerrada sin
 * `CRON_SECRET`— y ninguna regla propia: cuáles vencieron, en qué orden se
 * borran las claves y qué pasa cuando R2 rechaza lo decide
 * `sweepExpiredDrafts`, sobre puertos que no tienen con qué hacer otra cosa.
 *
 * **La ventana del barrido es un día y el borrador vive uno**, así que uno
 * abandonado se limpia entre 24 y 48 horas después. Es lo que la plataforma da:
 * el plan Hobby de Vercel corre cada cron una vez por día. Si esa cola importa,
 * la salida es más frecuencia, nunca acortar `DRAFT_LIFETIME_MS` — eso vencería
 * borradores escritos con la promesa de veinticuatro horas.
 */

// Toca la base en cada pedido; cachearla devolvería el conteo de ayer y haría
// creer que el trabajo corrió.
export const dynamic = "force-dynamic";

async function run(request: Request): Promise<Response> {
  if (!isAuthorizedJobRequest(request.headers.get("authorization"), readCronSecret())) {
    // Los dos ceros son explícitos: quien lea la respuesta tiene que poder
    // afirmar que no se borró ninguna fila ni ningún objeto.
    return Response.json(
      { error: "unauthorized", drafts_deleted: 0, objects_removed: 0 },
      { status: 401 },
    );
  }

  const handle = db as unknown as PublicationDraftDatabase;
  const result = await sweepExpiredDrafts({
    drafts: new DrizzleExpiredPublicationDrafts(handle),
    store: new DrizzlePublicationDraftStore(handle),
    objectStorage: createR2PhotoStorage(),
  });

  return Response.json({
    drafts_deleted: result.draftsDeleted,
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
