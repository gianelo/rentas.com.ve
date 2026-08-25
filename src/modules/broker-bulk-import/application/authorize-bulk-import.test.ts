import { describe, expect, it, vi } from "vitest";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../identity/application/ports/session.port";
import { UnauthenticatedError } from "../../identity/application/require-authenticated-session";
import { authorizeBulkImport, BulkImportDisabledError } from "./authorize-bulk-import";
import type { BulkImportAccountPort } from "./ports/bulk-import-account.port";

/**
 * broker-bulk-import spec, Requirement: Operator-Granted Access (tasks.md
 * 9.2/9.3, design.md Security Boundaries "Bulk import access").
 *
 * **This is the one function every import endpoint calls first**, same
 * shape as `requireAuthenticatedSession` for the session gate and
 * `reportListing`/`restoreListing` for how a use case composes a session
 * check with a domain decision. A future CSV upload/confirm/photo-attach
 * endpoint reusing this function is what makes "hiding the UI is not the
 * control" true in code and not only in the spec's words.
 */

const SESSION: AuthenticatedSession = { userId: "broker-1", email: null, name: null };

function sessionPortReturning(session: AuthenticatedSession | null): SessionPort {
  return { getSession: vi.fn().mockResolvedValue(session) };
}

function accountsReturning(account: { bulkImportEnabled: boolean } | null): BulkImportAccountPort {
  return { findAccount: vi.fn().mockResolvedValue(account) };
}

describe("authorizeBulkImport", () => {
  it("resolves with the session's userId when the flag is enabled", async () => {
    const accounts = accountsReturning({ bulkImportEnabled: true });

    const result = await authorizeBulkImport({
      sessionPort: sessionPortReturning(SESSION),
      accounts,
    });

    expect(result).toEqual({ userId: "broker-1" });
    expect(accounts.findAccount).toHaveBeenCalledWith("broker-1");
  });

  it("rejects with UnauthenticatedError when there is no session, before reading the account", async () => {
    const accounts = accountsReturning({ bulkImportEnabled: true });

    await expect(
      authorizeBulkImport({ sessionPort: sessionPortReturning(null), accounts }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(accounts.findAccount).not.toHaveBeenCalled();
  });

  it("rejects with BulkImportDisabledError when the flag is false", async () => {
    await expect(
      authorizeBulkImport({
        sessionPort: sessionPortReturning(SESSION),
        accounts: accountsReturning({ bulkImportEnabled: false }),
      }),
    ).rejects.toBeInstanceOf(BulkImportDisabledError);
  });

  // Fail closed: an account row the port could not find refuses exactly like
  // a disabled flag — it never falls through as "authorized by default".
  it("rejects with BulkImportDisabledError when the account cannot be read", async () => {
    await expect(
      authorizeBulkImport({
        sessionPort: sessionPortReturning(SESSION),
        accounts: accountsReturning(null),
      }),
    ).rejects.toBeInstanceOf(BulkImportDisabledError);
  });
});
