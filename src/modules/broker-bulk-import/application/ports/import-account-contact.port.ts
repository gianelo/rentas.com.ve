import type { AccountDefaultContact } from "../../domain/import-account-contact";

/**
 * The one fact `runImportValidation` needs about the importing account's
 * default contact (tasks.md 9.12-9.17). Narrow on purpose, same reasoning
 * as `BulkImportAccountPort`: this port exists to answer "what is this
 * account's default contact", never to read or write anything else.
 */
export interface ImportAccountContactPort {
  findAccountContact(userId: string): Promise<AccountDefaultContact | null>;
}
