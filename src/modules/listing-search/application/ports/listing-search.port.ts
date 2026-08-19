import type { SearchCriteria } from "../../domain/search-criteria";

/**
 * The read side of the catalogue (tasks.md 5.2, design.md D5).
 *
 * Modelled on listing-trust's `PhotoHashPort` — this codebase's canonical
 * "guarantees live in the narrowest API". The guarantee here is city
 * isolation: `search` is the only method, and its only argument carries a
 * required non-nullable `cityId`. There is no `searchAll` and no sentinel
 * meaning "everywhere", so an unscoped query is not expressible.
 *
 * STATED AT ITS REAL STRENGTH, as D4's port does: that is a property of
 * this interface's current shape, not of the runtime — nothing here stops
 * an adapter from ignoring `cityId` once inside, which is why
 * tests/integration/listing-search.test.ts asserts against real Postgres
 * rows instead of a fake that filters because it was written to.
 *
 * **Status is deliberately not a criterion** (tasks.md 5.5/5.6). Exposing
 * it would put "include the expired ones" one word away, and a search that
 * surfaces an expired or auto-hidden advert wastes a tenant's message on a
 * flat that is gone. It lives in the adapter's `WHERE`, unconditionally.
 */
export interface ListingSearchResult {
  readonly id: string;
  /**
   * Echoed back rather than assumed. It is what lets a test — and a caller
   * — assert isolation against the row itself instead of trusting the
   * argument it just passed in.
   */
  readonly cityId: string;
  readonly zoneId: string;
  readonly title: string;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly areaM2: number;
  /**
   * The owner/broker distinction the result row must carry (tasks.md 5.7,
   * SISTEMA.md "Distinción dueño / inmobiliaria"). Selected here so the UI
   * cannot render a row without it.
   */
  readonly publisherType: "owner" | "broker";
  readonly publishedAt: Date;
}

export interface ListingSearchPort {
  search(criteria: SearchCriteria): Promise<readonly ListingSearchResult[]>;
}
