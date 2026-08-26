import { describe, expect, it } from "vitest";
import { type AccountDefaultContact, resolveImportAccountContact } from "./import-account-contact";

/**
 * broker-bulk-import spec is silent on contact (the CSV never carries it —
 * "Accepted CSV Structure" scenario "Unknown columns are ignored, not
 * mapped" explicitly names `contact_method` as one such column), but
 * `listing.contact_method`/`contact_value` are NOT NULL while
 * `user.contact_method`/`contact_value` are nullable. An account with no
 * default contact cannot produce a single valid draft — this function is
 * the fail-closed guard the orchestrator's prompt asked for by name.
 */
describe("resolveImportAccountContact", () => {
  it("resolves the account's contact when both fields are set", () => {
    const account: AccountDefaultContact = {
      contactMethod: "whatsapp",
      contactValue: "04121234567",
    };

    expect(resolveImportAccountContact(account)).toEqual({
      contactMethod: "whatsapp",
      contactValue: "04121234567",
    });
  });

  it("fails closed when the account row could not be found", () => {
    expect(resolveImportAccountContact(null)).toBeNull();
  });

  it("fails closed when contactMethod is null", () => {
    expect(
      resolveImportAccountContact({ contactMethod: null, contactValue: "04121234567" }),
    ).toBeNull();
  });

  it("fails closed when contactValue is null", () => {
    expect(
      resolveImportAccountContact({ contactMethod: "whatsapp", contactValue: null }),
    ).toBeNull();
  });

  it("fails closed when contactValue is blank", () => {
    expect(
      resolveImportAccountContact({ contactMethod: "whatsapp", contactValue: "   " }),
    ).toBeNull();
  });
});
