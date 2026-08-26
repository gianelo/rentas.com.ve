import { describe, expect, it, vi } from "vitest";
import type { SessionPort } from "../../identity/application/ports/session.port";
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
        { sessionPort: sessionPortReturning(null), zones, listings, now: () => NOW },
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(listings.findDraftById).not.toHaveBeenCalled();
  });

  it("throws ActivateListingNotFoundError when the draft does not exist (or is not a draft)", async () => {
    const listings = activationPort(null);

    await expect(
      activateListing(
        { listingId: DRAFT_ID },
        { sessionPort: sessionPortReturning(PUBLISHER), zones, listings, now: () => NOW },
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
        { sessionPort: sessionPortReturning(PUBLISHER), zones, listings, now: () => NOW },
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
      { sessionPort: sessionPortReturning(PUBLISHER), zones, listings, now: () => NOW },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ActivateListingRejectedError);
    expect((error as ActivateListingRejectedError).violations).toContain("photos.required");
    expect(listings.activate).not.toHaveBeenCalled();
  });

  it("reuses the SAME rule the single-listing flow applies for an uncurated zone", async () => {
    const listings = activationPort(draft({ zoneId: "zone-unknown" }));

    const error = await activateListing(
      { listingId: DRAFT_ID },
      { sessionPort: sessionPortReturning(PUBLISHER), zones, listings, now: () => NOW },
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
      { sessionPort: sessionPortReturning(PUBLISHER), zones, listings, now: () => NOW },
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
        { sessionPort: sessionPortReturning(PUBLISHER), zones, listings, now: () => NOW },
      ),
    ).rejects.toBeInstanceOf(ActivateListingNotFoundError);
  });
});
