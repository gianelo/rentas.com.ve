import { restoreListing } from "../../../../src/modules/listing-trust/application/restore-listing";
import { isAuthorizedOperatorRequest } from "../../../../src/modules/listing-trust/domain/operator-authorization";
import {
  DrizzleListingModeration,
  DrizzleModerationActions,
} from "../../../../src/modules/listing-trust/infrastructure/drizzle-listing-moderation";
import { readOperatorSecret } from "../../../../src/modules/listing-trust/infrastructure/moderation-config";
import { db } from "../../../../src/shared/db/client";

/**
 * La ruta de restauración del operador (tasks.md 8.5/8.6).
 *
 * **No decide nada.** Comprueba el portador, lee el `listingId` del cuerpo,
 * llama al caso de uso y traduce el resultado a JSON — mismo reparto que
 * `app/api/jobs/expiry-reminders/route.ts`: a qué estado vuelve un aviso, y
 * si puede volver, vive en `src/modules/listing-trust/`, nunca acá.
 *
 * **Mínima a propósito** (tasks.md 8.6): un método, un campo de entrada, sin
 * paginado ni listado — la superficie que un operador necesita para
 * levantar un aviso mal escondido, y nada más.
 */

export const dynamic = "force-dynamic";

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

interface RestoreBody {
  readonly listingId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorizedOperatorRequest(request.headers.get("authorization"), readOperatorSecret())) {
    return unauthorized();
  }

  let body: RestoreBody;
  try {
    body = (await request.json()) as RestoreBody;
  } catch {
    return Response.json({ error: "missing_listing_id" }, { status: 400 });
  }

  if (typeof body.listingId !== "string" || body.listingId.length === 0) {
    return Response.json({ error: "missing_listing_id" }, { status: 400 });
  }

  const handle = db as unknown as ConstructorParameters<typeof DrizzleListingModeration>[0];

  try {
    const result = await restoreListing(
      { listingId: body.listingId },
      {
        listings: new DrizzleListingModeration(handle),
        moderationActions: new DrizzleModerationActions(handle),
      },
    );

    return Response.json({ listing_id: body.listingId, status: result.status });
  } catch (error) {
    if (error instanceof Error && error.name === "ListingNotFoundError") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (error instanceof Error && error.name === "ListingNotHiddenError") {
      return Response.json({ error: "not_hidden" }, { status: 409 });
    }
    throw error;
  }
}
