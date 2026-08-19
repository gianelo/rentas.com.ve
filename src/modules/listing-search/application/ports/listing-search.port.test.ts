import { describe, expect, it } from "vitest";
import type { SearchCriteria } from "../../domain/search-criteria";
import type { ListingSearchPort, ListingSearchResult } from "./listing-search.port";

/**
 * Task 5.1 is a **type-level** assertion, and it is checked by `pnpm
 * typecheck`, not by this runtime pass. Each `@ts-expect-error` below fails
 * the build the day the error it expects stops happening — which is exactly
 * the day someone makes `cityId` optional or nullable and re-opens D5.
 * Written as a runtime spec too so the file is a normal member of the suite.
 */

const anySearch = (criteria: SearchCriteria) => criteria;

describe("SearchCriteria rejects an unscoped search at compile time (D5)", () => {
  it("has no representable form without a city", () => {
    // @ts-expect-error — `cityId` is required; there is no all-cities search.
    anySearch({ zoneId: "zone-1" });
    // @ts-expect-error — and it is non-nullable, so `null` is not a scope.
    anySearch({ cityId: null });
    // @ts-expect-error — nor is `undefined`.
    anySearch({ cityId: undefined });

    expect(anySearch({ cityId: "city-1" })).toEqual({ cityId: "city-1" });
  });
});

describe("ListingSearchPort", () => {
  it("answers a criteria object with rows a result list can render", async () => {
    // The in-memory stand-in a use case would take. It proves the shape
    // compiles and nothing more — the filtering itself is SQL, and it is
    // proven against real Postgres in tests/integration/listing-search.test.ts.
    const row: ListingSearchResult = {
      id: "listing-1",
      cityId: "city-1",
      zoneId: "zone-1",
      title: "Apartamento en Santa Rosalía",
      priceUsd: 320,
      rooms: 2,
      areaM2: 74,
      publisherType: "owner",
      publishedAt: new Date("2026-08-01T00:00:00Z"),
    };
    const port: ListingSearchPort = { search: async () => [row] };

    expect(await port.search({ cityId: "city-1" })).toEqual([row]);
  });
});
