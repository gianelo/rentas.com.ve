import { describe, expect, it, vi } from "vitest";
import type { SessionPort } from "../../identity/application/ports/session.port";
import type {
  ContactVerificationEvidencePort,
  ContactVerificationQuery,
  NewVerifiedContact,
  VerifiedContactPort,
} from "../../identity/application/ports/verified-contact.port";
import { UnauthenticatedError } from "../../identity/application/require-authenticated-session";
import { expiryFor } from "../../listing-lifecycle/domain/expiry";
import {
  ActivateListingNotFoundError,
  ActivateListingNotOwnedError,
  ActivateListingRejectedError,
  activateListing,
} from "./activate-listing";
import type { DraftForActivation, ListingActivationPort } from "./ports/listing-activation.port";
import type { ZoneCataloguePort } from "./ports/zone-catalogue.port";

/**
 * broker-bulk-import spec, "Drafts Are Not Published Listings" (tasks.md
 * 9.18/9.19): what activation decides, proven against fakes. The unique
 * `(publisher_id, external_reference)` idempotency lesson from 9.17 does
 * not apply here — there is no constraint this use case leans on Postgres
 * for — but the write-time RECOMPUTATION of `publishedAt`/`expiresAt` and
 * the draft-invisibility side of this spec's own scenarios can only be
 * proven against real Postgres (search's `WHERE status = 'active'`,
 * `findRevealable`'s same filter, `findRenewable`/`findModerated`'s new
 * guard): see tests/integration/listing-activation.test.ts.
 */

const PUBLISHER = "broker-1";
const OTHER_PUBLISHER = "broker-2";
const CITY = "city-distrito-capital";
const ZONE = "zone-chacao";
const DRAFT_ID = "draft-1";
const NOW = new Date("2026-08-25T12:00:00.000Z");

const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

function draft(overrides: Partial<DraftForActivation> = {}): DraftForActivation {
  return {
    id: DRAFT_ID,
    publisherId: PUBLISHER,
    publisherType: "broker",
    propertyType: "apartamento",
    cityId: CITY,
    zoneId: ZONE,
    title: "Aviso importado",
    description: VALID_DESCRIPTION,
    priceUsd: 450,
    rooms: 2,
    areaM2: 78,
    bathrooms: 2,
    parkingSpots: 0,
    hasPowerPlant: false,
    hasRegularWater: false,
    isFurnished: false,
    hasSecurity: false,
    hasAppliances: false,
    contactMethod: "whatsapp",
    contactValue: "04121234567",
    photoCount: 1,
    ...overrides,
  };
}

function sessionPortReturning(userId: string | null): SessionPort {
  return {
    async getSession() {
      return userId ? { userId, email: null, name: null } : null;
    },
  };
}

const zones: ZoneCataloguePort = {
  async listZonesForCity(cityId: string) {
    return cityId === CITY ? [{ id: ZONE, cityId: CITY }] : [];
  },
};

const PUBLISHER_EMAIL = "broker-1@example.com";
const EMAIL_VERIFIED_AT = new Date("2026-06-01T07:00:00.000Z");

/**
 * tasks.md 19.15 — the two `verified_contact` ports activation now needs. The
 * account signed in through the mail link, so Auth.js left the instant
 * (19.10); Google would not have (19.14).
 */
function contactEvidencePort(): ContactVerificationEvidencePort & {
  readonly asked: ContactVerificationQuery[];
} {
  const asked: ContactVerificationQuery[] = [];
  return {
    asked,
    async findEvidence(query) {
      asked.push(query);
      return {
        verifiedAt: null,
        accountEmail: PUBLISHER_EMAIL,
        accountEmailVerifiedAt: EMAIL_VERIFIED_AT,
      };
    },
  };
}

function recordingContacts(): VerifiedContactPort & { readonly written: NewVerifiedContact[] } {
  const written: NewVerifiedContact[] = [];
  return {
    written,
    async record(verified) {
      written.push(verified);
    },
  };
}

/** Fresh ports for the calls that do not inspect them. */
function verification() {
  return { contactEvidence: contactEvidencePort(), verifiedContacts: recordingContacts() };
}

function activationPort(row: DraftForActivation | null): ListingActivationPort & {
  readonly activateCalls: ReadonlyArray<readonly [string, Date, Date]>;
} {
  const activateCalls: Array<readonly [string, Date, Date]> = [];
  return {
    activateCalls,
    findDraftById: vi.fn(async () => row),
    activate: vi.fn(async (listingId: string, publishedAt: Date, expiresAt: Date) => {
      activateCalls.push([listingId, publishedAt, expiresAt]);
      return true;
    }),
  };
}

describe("activateListing", () => {
  it("rejects with UnauthenticatedError before reading the draft", async () => {
    const listings = activationPort(draft());

    await expect(
      activateListing(
        { listingId: DRAFT_ID },
        {
          sessionPort: sessionPortReturning(null),
          zones,
          listings,
          now: () => NOW,
          ...verification(),
        },
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(listings.findDraftById).not.toHaveBeenCalled();
  });

  it("throws ActivateListingNotFoundError when the draft does not exist (or is not a draft)", async () => {
    const listings = activationPort(null);

    await expect(
      activateListing(
        { listingId: DRAFT_ID },
        {
          sessionPort: sessionPortReturning(PUBLISHER),
          zones,
          listings,
          now: () => NOW,
          ...verification(),
        },
      ),
    ).rejects.toBeInstanceOf(ActivateListingNotFoundError);
  });

  // Mutation-check target: ownership must be checked BEFORE the write, and
  // must refuse rather than silently activate a stranger's draft.
  it("throws ActivateListingNotOwnedError for another broker's draft, and never activates it", async () => {
    const listings = activationPort(draft({ publisherId: OTHER_PUBLISHER }));

    await expect(
      activateListing(
        { listingId: DRAFT_ID },
        {
          sessionPort: sessionPortReturning(PUBLISHER),
          zones,
          listings,
          now: () => NOW,
          ...verification(),
        },
      ),
    ).rejects.toBeInstanceOf(ActivateListingNotOwnedError);

    expect(listings.activate).not.toHaveBeenCalled();
  });

  // Mutation-check target the orchestrator's prompt named explicitly:
  // activation must re-validate at the "activation" stage, which is the
  // ONLY stage that requires at least one photo.
  it("refuses a draft with zero photos, naming photos.required, and never activates it", async () => {
    const listings = activationPort(draft({ photoCount: 0 }));

    const error = await activateListing(
      { listingId: DRAFT_ID },
      {
        sessionPort: sessionPortReturning(PUBLISHER),
        zones,
        listings,
        now: () => NOW,
        ...verification(),
      },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ActivateListingRejectedError);
    expect((error as ActivateListingRejectedError).violations).toContain("photos.required");
    expect(listings.activate).not.toHaveBeenCalled();
  });

  it("reuses the SAME rule the single-listing flow applies for an uncurated zone", async () => {
    const listings = activationPort(draft({ zoneId: "zone-unknown" }));

    const error = await activateListing(
      { listingId: DRAFT_ID },
      {
        sessionPort: sessionPortReturning(PUBLISHER),
        zones,
        listings,
        now: () => NOW,
        ...verification(),
      },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ActivateListingRejectedError);
    expect((error as ActivateListingRejectedError).violations).toContain("zoneId.notInCity");
    expect(listings.activate).not.toHaveBeenCalled();
  });

  // Mutation-check target the orchestrator's prompt named explicitly:
  // activation must RECOMPUTE both timestamps from the activation moment,
  // never reuse the import's zero-duration placeholder.
  it("activates with publishedAt/expiresAt computed from `now`, via expiryFor — never restated", async () => {
    const listings = activationPort(draft());

    const result = await activateListing(
      { listingId: DRAFT_ID },
      {
        sessionPort: sessionPortReturning(PUBLISHER),
        zones,
        listings,
        now: () => NOW,
        ...verification(),
      },
    );

    const expectedExpiresAt = expiryFor({ publishedAt: NOW, lastRenewedAt: null });

    expect(result).toEqual({ listingId: DRAFT_ID, publishedAt: NOW, expiresAt: expectedExpiresAt });
    expect(listings.activateCalls).toEqual([[DRAFT_ID, NOW, expectedExpiresAt]]);
  });

  it("throws ActivateListingNotFoundError when a concurrent activation already won the race", async () => {
    const listings = activationPort(draft());
    (listings.activate as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    await expect(
      activateListing(
        { listingId: DRAFT_ID },
        {
          sessionPort: sessionPortReturning(PUBLISHER),
          zones,
          listings,
          now: () => NOW,
          ...verification(),
        },
      ),
    ).rejects.toBeInstanceOf(ActivateListingNotFoundError);
  });
});

/**
 * tasks.md 19.15 — **the bulk import verified nothing.** `publishListing` has
 * resolved contact verification since 2026-08-29; this path, the one Phase 9
 * takes a `draft` to `active` through, did not — so an agency importing fifty
 * rows left not one row in `verified_contact`.
 *
 * What is proven here is the SEAM, not the rule: the rule lives in
 * `contact-verification.test.ts` and the natural key that makes fifty imports
 * one row lives in `tests/integration/contact-verification.test.ts`. This is
 * the argument-passing that this project has now found unwired five times.
 */
describe("contact verification on activation (19.15)", () => {
  it("asks for the DRAFT's own contact triple, and records the account's email", async () => {
    const listings = activationPort(
      draft({ contactMethod: "email", contactValue: PUBLISHER_EMAIL }),
    );
    const contactEvidence = contactEvidencePort();
    const verifiedContacts = recordingContacts();

    await activateListing(
      { listingId: DRAFT_ID },
      {
        sessionPort: sessionPortReturning(PUBLISHER),
        zones,
        listings,
        now: () => NOW,
        contactEvidence,
        verifiedContacts,
      },
    );

    // The contact is the draft's, never the request's: the row about to become
    // active is the one whose `contact_method`/`contact_value` the ficha will
    // read back (19.9/19.12).
    expect(contactEvidence.asked).toEqual([
      { userId: PUBLISHER, contact: { method: "email", value: PUBLISHER_EMAIL } },
    ]);
    expect(verifiedContacts.written).toEqual([
      {
        userId: PUBLISHER,
        contact: { method: "email", value: PUBLISHER_EMAIL },
        verifiedAt: EMAIL_VERIFIED_AT,
      },
    ]);
  });

  it("activates a draft whose contact cannot be verified, and leaves no row", async () => {
    // The negative half, and it is the product decision rather than an
    // omission: WhatsApp's channel is deferred to the end of the project
    // (founder, 2026-08-29), so gating activation on verification would close
    // the import to every broker. What must not happen is a row appearing
    // anyway — without one, nothing can draw "verificado".
    const listings = activationPort(draft());
    const verifiedContacts = recordingContacts();

    const result = await activateListing(
      { listingId: DRAFT_ID },
      {
        sessionPort: sessionPortReturning(PUBLISHER),
        zones,
        listings,
        now: () => NOW,
        contactEvidence: contactEvidencePort(),
        verifiedContacts,
      },
    );

    expect(result.listingId).toBe(DRAFT_ID);
    expect(listings.activateCalls).toHaveLength(1);
    expect(verifiedContacts.written).toEqual([]);
  });

  it("never reads verification for a draft the rules refuse, or for a stranger's", async () => {
    // Same ordering `publishListing` uses for the photo pipeline: a draft that
    // was never activatable must not make this function do work. And a
    // stranger's draft must not have its owner's contact touched at all.
    const refused = contactEvidencePort();
    const notOwned = contactEvidencePort();

    await activateListing(
      { listingId: DRAFT_ID },
      {
        sessionPort: sessionPortReturning(PUBLISHER),
        zones,
        listings: activationPort(draft({ photoCount: 0 })),
        now: () => NOW,
        contactEvidence: refused,
        verifiedContacts: recordingContacts(),
      },
    ).catch(() => undefined);

    await activateListing(
      { listingId: DRAFT_ID },
      {
        sessionPort: sessionPortReturning(OTHER_PUBLISHER),
        zones,
        listings: activationPort(draft()),
        now: () => NOW,
        contactEvidence: notOwned,
        verifiedContacts: recordingContacts(),
      },
    ).catch(() => undefined);

    expect(refused.asked).toEqual([]);
    expect(notOwned.asked).toEqual([]);
  });

  /**
   * tasks.md 19.11 at this seam. The rule is proven in the domain; what is
   * measured here is that activation hands the decision ITS clock. With the
   * system clock in its place both halves below would answer the same.
   */
  it("records an account verification of eleven months, and refuses one of thirteen", async () => {
    const vivo = recordingContacts();
    const caducado = recordingContacts();
    const activar = (verifiedContacts: VerifiedContactPort, now: Date) =>
      activateListing(
        { listingId: DRAFT_ID },
        {
          sessionPort: sessionPortReturning(PUBLISHER),
          zones,
          listings: activationPort(
            draft({ contactMethod: "email", contactValue: PUBLISHER_EMAIL }),
          ),
          now: () => now,
          contactEvidence: contactEvidencePort(),
          verifiedContacts,
        },
      );

    await activar(vivo, new Date("2027-05-01T07:00:00.000Z"));
    await activar(caducado, new Date("2027-07-01T07:00:00.000Z"));

    expect(vivo.written).toHaveLength(1);
    expect(caducado.written).toEqual([]);
  });
});
