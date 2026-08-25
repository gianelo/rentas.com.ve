import type { SessionPort } from "../../identity/application/ports/session.port";
import { requireAuthenticatedSession } from "../../identity/application/require-authenticated-session";
import { isBulkImportAuthorized } from "../domain/bulk-import-authorization";
import type { BulkImportAccountPort } from "./ports/bulk-import-account.port";

/**
 * broker-bulk-import spec, Requirement: Operator-Granted Access (tasks.md
 * 9.2/9.3, design.md Security Boundaries "Bulk import access").
 *
 * **Every import endpoint calls this first, and nothing else decides
 * access.** Same shape as `reportListing`/`restoreListing`: the session
 * gate runs before anything else is read, and the actual decision —
 * whether the flag is set — is a domain function
 * (`isBulkImportAuthorized`), not an `if` re-written per route. A second
 * endpoint (CSV upload, confirm, photo attach — 9.7+) that skipped this
 * function and rolled its own check is exactly the failure mode the spec's
 * "hiding the UI MUST NOT be the only control" line is written against.
 */
export class BulkImportDisabledError extends Error {
  constructor(userId: string) {
    super(`authorize-bulk-import: account ${userId} does not have bulk import enabled.`);
    this.name = "BulkImportDisabledError";
  }
}

export interface AuthorizeBulkImportDependencies {
  readonly sessionPort: SessionPort;
  readonly accounts: BulkImportAccountPort;
}

export interface AuthorizedBulkImportRequest {
  readonly userId: string;
}

export async function authorizeBulkImport(
  dependencies: AuthorizeBulkImportDependencies,
): Promise<AuthorizedBulkImportRequest> {
  const { sessionPort, accounts } = dependencies;

  const session = await requireAuthenticatedSession(sessionPort);

  const account = await accounts.findAccount(session.userId);
  if (!isBulkImportAuthorized(account)) {
    throw new BulkImportDisabledError(session.userId);
  }

  return { userId: session.userId };
}
