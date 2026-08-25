import type { ContactMethod } from "../../listing-publication/domain/publishable-listing";

/**
 * broker-bulk-import spec, "Accepted CSV Structure" (a `contact_method`
 * column, if present, is dropped like `publisher_type`) + schema.ts:
 * `listing.contact_method`/`contact_value` are NOT NULL while
 * `user.contact_method`/`contact_value` are nullable.
 *
 * **An account with no default contact cannot produce a single valid
 * draft.** Importing fifty rows that can never be activated — silent,
 * invisible, discovered weeks later — is worse than refusing the whole
 * import up front with a message telling the broker to set their contact
 * first. Checked ONCE per import (`runImportValidation`), not once per row:
 * fifty rows failing on the same missing account field is not fifty
 * separate facts.
 */
export interface AccountDefaultContact {
  readonly contactMethod: ContactMethod | null;
  readonly contactValue: string | null;
}

export interface ResolvedImportContact {
  readonly contactMethod: ContactMethod;
  readonly contactValue: string;
}

/**
 * Fails closed (AGENTS.md §7): a `null` account, a `null` contactMethod, or
 * a `null`/blank contactValue all resolve to `null` — never "the caller
 * forgot" silently passing an empty string through to the `listing` insert.
 */
export function resolveImportAccountContact(
  account: AccountDefaultContact | null,
): ResolvedImportContact | null {
  if (!account) return null;
  if (!account.contactMethod) return null;
  if (!account.contactValue || account.contactValue.trim() === "") return null;
  return { contactMethod: account.contactMethod, contactValue: account.contactValue };
}
