/**
 * broker-bulk-import spec, Requirement: Operator-Granted Access (tasks.md
 * 9.1-9.3): "The system MUST enforce this flag server-side on every import
 * endpoint. Hiding the user interface MUST NOT be the only control."
 *
 * **Pure and I/O-free**, same idiom as `resolveReportOutcome` and
 * `reveal-rate-limit.ts`: it receives what the port already found and
 * answers one question. Every future import endpoint (CSV upload, confirm,
 * photo attach — 9.7+) calls this exact function through
 * `authorizeBulkImport` instead of re-reading the column itself, which is
 * what keeps a second route from copy-pasting a weaker check — the same
 * precedent `operator-authorization.ts` and `cron-authorization.ts` set for
 * an authorisation rule that must live in the domain.
 */
export interface BulkImportAccount {
  readonly bulkImportEnabled: boolean;
}

/**
 * Fails closed (AGENTS.md §7): an account the caller could not find — the
 * `null` branch — is refused exactly like one whose flag reads `false`.
 * `bulk_import_enabled` is NOT NULL with a default of `false` at the schema
 * level, so a found row can never leave this function undecided; the `null`
 * case only covers the account itself being unreadable.
 */
export function isBulkImportAuthorized(account: BulkImportAccount | null): boolean {
  return account?.bulkImportEnabled === true;
}
