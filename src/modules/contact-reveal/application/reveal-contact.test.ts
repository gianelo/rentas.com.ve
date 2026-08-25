import { describe, expect, it, vi } from "vitest";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../identity/application/ports/session.port";
import { UnauthenticatedError } from "../../identity/application/require-authenticated-session";
import { REVEAL_RATE_LIMIT_MAX_DISTINCT_LISTINGS } from "../domain/reveal-rate-limit";
import type {
  ContactRevealEventPort,
  NewContactRevealEvent,
} from "./ports/contact-reveal-event.port";
import type { RevealRateLimitPort } from "./ports/reveal-rate-limit.port";
import type { RevealableListing, RevealableListingPort } from "./ports/revealable-listing.port";
import {
  ListingNotRevealableError,
  RevealRateLimitExceededError,
  revealContact,
} from "./reveal-contact";

const TENANT: AuthenticatedSession = {
  userId: "tenant-1",
  email: "tenant@example.com",
  name: "Jane Doe",
};

const LISTING: RevealableListing = {
  listingId: "listing-1",
  publisherId: "publisher-1",
  cityId: "city-caracas",
  contactMethod: "whatsapp",
  contactValue: "+58 412 555 0134",
};

/** Records what was written, in order, so "how many rows" is an assertion. */
function recordingEvents(): ContactRevealEventPort & { readonly written: NewContactRevealEvent[] } {
  const written: NewContactRevealEvent[] = [];
  return {
    written,
    record: async (event) => {
      written.push(event);
    },
  };
}

function dependencies(
  session: AuthenticatedSession | null,
  listing = LISTING,
  recentlyRevealedListingIds: readonly string[] = [],
) {
  const sessionPort: SessionPort = { getSession: vi.fn().mockResolvedValue(session) };
  const listings: RevealableListingPort = {
    findRevealable: vi.fn().mockResolvedValue(listing),
  };
  const events = recordingEvents();
  const rateLimit: RevealRateLimitPort = {
    findRecentlyRevealedListingIds: vi.fn().mockResolvedValue(recentlyRevealedListingIds),
  };
  const clock = { at: new Date("2026-03-01T10:00:00.000Z") };

  return { sessionPort, listings, events, rateLimit, now: () => clock.at, clock };
}

describe("revealContact", () => {
  // contact-reveal spec, Requirement: Reveal Requires Authenticated Tenant.
  // Routing to Google Sign-In is a delivery concern; what this layer owes is
  // that the anonymous attempt writes nothing — an unauthenticated reveal
  // that still recorded an event would poison the north-star metric with
  // rows carrying no real tenant.
  it("refuses an anonymous visitor and records nothing", async () => {
    const deps = dependencies(null);

    await expect(revealContact({ listingId: LISTING.listingId }, deps)).rejects.toThrow(
      UnauthenticatedError,
    );
    expect(deps.events.written).toHaveLength(0);
  });

  // contact-reveal spec, "A reveal creates one event record" — the five
  // fields are named individually because each one is a question the go/pivot
  // report has to answer (design.md D6: per city, per listing, over time).
  it("records exactly one event carrying listing, publisher, tenant, city and timestamp", async () => {
    const deps = dependencies(TENANT);

    await revealContact({ listingId: LISTING.listingId }, deps);

    expect(deps.events.written).toEqual([
      {
        listingId: "listing-1",
        publisherId: "publisher-1",
        tenantUserId: "tenant-1",
        cityId: "city-caracas",
        revealedAt: new Date("2026-03-01T10:00:00.000Z"),
      },
    ]);
  });

  // contact-reveal spec, "Repeated reveals by the same tenant still count".
  // Task 6.4: NOT deduplicated at write time. Deduplication is the view's
  // job (`contact_reveal_unique_pair`), and doing it here instead would
  // destroy the raw action count the spec also requires — one table cannot
  // give back a row it never wrote.
  it("writes a second event when the same tenant reveals the same listing again", async () => {
    const deps = dependencies(TENANT);

    await revealContact({ listingId: LISTING.listingId }, deps);
    deps.clock.at = new Date("2026-03-08T10:00:00.000Z");
    await revealContact({ listingId: LISTING.listingId }, deps);

    expect(deps.events.written).toHaveLength(2);
    expect(deps.events.written.map((event) => event.revealedAt)).toEqual([
      new Date("2026-03-01T10:00:00.000Z"),
      new Date("2026-03-08T10:00:00.000Z"),
    ]);
  });

  it("returns the contact to the tenant who revealed it", async () => {
    const deps = dependencies(TENANT);

    await expect(revealContact({ listingId: LISTING.listingId }, deps)).resolves.toEqual({
      state: "revealed",
      method: "whatsapp",
      value: "+58 412 555 0134",
    });
  });

  // A listing that cannot be revealed (unknown, draft, removed) must not
  // leave an event behind. The metric counts reveals of real listings; a row
  // pointing at nothing is a row nobody can interpret six months later.
  it("records nothing when the listing is not revealable", async () => {
    const deps = dependencies(TENANT, null as unknown as RevealableListing);

    await expect(revealContact({ listingId: "gone" }, deps)).rejects.toThrow(
      ListingNotRevealableError,
    );
    expect(deps.events.written).toHaveLength(0);
  });

  it("stamps the event with the real clock when no clock is injected", async () => {
    // Production passes no `now`. An event whose timestamp came from a
    // default that was never exercised is a timestamp nobody has checked —
    // and `revealed_at` is the axis the whole go/pivot report is read along.
    const { sessionPort, listings, events, rateLimit } = dependencies(TENANT);
    const before = Date.now();

    await revealContact(
      { listingId: LISTING.listingId },
      { sessionPort, listings, events, rateLimit },
    );

    const stamped = events.written[0]?.revealedAt.getTime() ?? 0;
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });

  it("reads the session before touching the listing at all", async () => {
    // Ordering, not politeness: an anonymous request must not be able to make
    // this function query the catalogue, or the sign-in gate becomes a
    // database load amplifier for anyone with a URL.
    const deps = dependencies(null);

    await expect(revealContact({ listingId: LISTING.listingId }, deps)).rejects.toThrow(
      UnauthenticatedError,
    );
    expect(deps.listings.findRevealable).not.toHaveBeenCalled();
  });

  // contact-reveal spec, "An account below the limit reveals normally".
  it("reveals normally when the account is below the rate limit", async () => {
    const recent = Array.from(
      { length: REVEAL_RATE_LIMIT_MAX_DISTINCT_LISTINGS - 1 },
      (_, i) => `other-listing-${i}`,
    );
    const deps = dependencies(TENANT, LISTING, recent);

    await expect(revealContact({ listingId: LISTING.listingId }, deps)).resolves.toMatchObject({
      state: "revealed",
    });
    expect(deps.events.written).toHaveLength(1);
  });

  // contact-reveal spec, "An account at the limit is refused" (tasks.md 6.9).
  // The refusal writes no reveal event and discloses no contact value — the
  // catalog must not be drainable by one registered account.
  it("refuses the 41st distinct listing and records nothing", async () => {
    const recent = Array.from(
      { length: REVEAL_RATE_LIMIT_MAX_DISTINCT_LISTINGS },
      (_, i) => `other-listing-${i}`,
    );
    const deps = dependencies(TENANT, LISTING, recent);

    await expect(revealContact({ listingId: LISTING.listingId }, deps)).rejects.toThrow(
      RevealRateLimitExceededError,
    );
    expect(deps.events.written).toHaveLength(0);
  });

  // contact-reveal spec, "Repeat reveals of an already-revealed listing
  // consume no allowance". The unit is the listing, never the action: a
  // tenant re-opening the same advert while comparing is not draining the
  // catalogue.
  it("allows re-revealing a listing already inside the window, even at the limit", async () => {
    const recent = Array.from(
      { length: REVEAL_RATE_LIMIT_MAX_DISTINCT_LISTINGS - 1 },
      (_, i) => `other-listing-${i}`,
    ).concat(LISTING.listingId);
    const deps = dependencies(TENANT, LISTING, recent);

    await expect(revealContact({ listingId: LISTING.listingId }, deps)).resolves.toMatchObject({
      state: "revealed",
    });
    expect(deps.events.written).toHaveLength(1);
  });
});
