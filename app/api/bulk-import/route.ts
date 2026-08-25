import {
  authorizeBulkImport,
  BulkImportDisabledError,
} from "../../../src/modules/broker-bulk-import/application/authorize-bulk-import";
import { DrizzleBulkImportAccounts } from "../../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import { UnauthenticatedError } from "../../../src/modules/identity/application/require-authenticated-session";
import { nextAuthSessionPort } from "../../../src/modules/identity/infrastructure/session-port";
import { db } from "../../../src/shared/db/client";

/**
 * broker-bulk-import spec, Requirement: Operator-Granted Access (tasks.md
 * 9.2/9.3, design.md Security Boundaries "Bulk import access").
 *
 * **This slice is the guard, and only the guard.** `authorizeBulkImport` is
 * called before anything else runs, exactly like `restore-listing`'s route
 * checks its bearer token first — the difference here is the gate is a
 * per-account flag behind a real session, not a shared secret, because a
 * bulk import is a broker acting on their own portfolio. CSV parsing,
 * preview, and confirmation (tasks.md 9.4-9.17) replace the body below;
 * they do not touch the guard above it.
 *
 * **No draft can be created past this point today** — `ValidateImportUseCase`
 * and `ConfirmImportUseCase` do not exist yet, so an authorized request
 * still has nothing to reach. That is deliberate: the RED test for this
 * slice (tasks.md 9.2) only has to prove the disabled path refuses and
 * writes nothing, and today NOTHING writes, which is the strongest version
 * of that guarantee available before 9.15 lands.
 */
export const dynamic = "force-dynamic";

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function forbidden(): Response {
  return Response.json({ error: "bulk_import_disabled" }, { status: 403 });
}

export async function POST(): Promise<Response> {
  const handle = db as unknown as ConstructorParameters<typeof DrizzleBulkImportAccounts>[0];

  try {
    await authorizeBulkImport({
      sessionPort: nextAuthSessionPort,
      accounts: new DrizzleBulkImportAccounts(handle),
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorized();
    if (error instanceof BulkImportDisabledError) return forbidden();
    throw error;
  }

  // tasks.md 9.4+ build the real parse/preview/confirm pipeline here.
  return Response.json({ error: "not_implemented" }, { status: 501 });
}
