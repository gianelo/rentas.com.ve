/**
 * The one fact `authorizeBulkImport` needs about the importing account
 * (tasks.md 9.2/9.3). One method, narrow on purpose — same reasoning as
 * `ContactRevealEventPort` having only `record()`: this port exists to
 * answer "is this account allowed to import", never to read or write
 * anything else about the account.
 */
export interface BulkImportAccount {
  readonly bulkImportEnabled: boolean;
}

export interface BulkImportAccountPort {
  findAccount(userId: string): Promise<BulkImportAccount | null>;
}
