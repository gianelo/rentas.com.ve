# Listing Search Specification

## Purpose

Visitors browse and filter active listings by city, zone, price, and characteristics. City isolation is absolute: a search scoped to one launch city must never surface a listing from the other, under any filter combination.

## Non-Goals

Cross-city search results, search across expired/hidden listings, saved searches, favorites, map-based search.

## Requirements

### Requirement: Filter by City, Zone, Price, and Characteristics

The system MUST allow filtering active listings by `city`, `zone`, price range (min/max), and listing characteristics captured at publication.

#### Scenario: Combined filters narrow results correctly

- GIVEN active listings across both cities with varying zones, prices, and characteristics
- WHEN a visitor filters by `city = Distrito Capital`, a specific zone, and a price range
- THEN only active `Distrito Capital` listings matching that zone and price range are returned

### Requirement: Absolute City Isolation

The system MUST NOT return a listing from one launch city when the search is scoped to the other launch city, regardless of which other filters (zone, price, characteristics) are applied or omitted.

#### Scenario: Maracaibo search never returns a Distrito Capital listing

- GIVEN active listings exist in both `Distrito Capital` and `Maracaibo`
- WHEN a visitor searches with `city = Maracaibo` and no other filters
- THEN every result has `city = Maracaibo` and zero `Distrito Capital` listings appear

#### Scenario: City isolation holds even with a wide price range

- GIVEN active listings exist in both cities, including a `Distrito Capital` listing whose price falls inside a searched price range
- WHEN a visitor searches with `city = Maracaibo` and a price range wide enough to include that `Distrito Capital` listing's price
- THEN the `Distrito Capital` listing is still excluded from the results

#### Scenario: City isolation holds with a zone filter present

- GIVEN a visitor searches with `city = Maracaibo` and a zone value
- WHEN the zone value happens to collide in name with a `Distrito Capital` zone
- THEN only `Maracaibo` listings matching that zone are returned — no `Distrito Capital` listing appears

### Requirement: Only Active Listings Are Searchable

The system MUST exclude expired listings and auto-hidden (reported) listings from search results. The system MUST show a listing in results only while it is active (not expired, not hidden).

#### Scenario: Expired listing is excluded

- GIVEN a listing whose 30-day window has elapsed without renewal
- WHEN a visitor searches with filters that would otherwise match it
- THEN the expired listing does not appear in the results

#### Scenario: Auto-hidden listing is excluded

- GIVEN a listing that has reached the report auto-hide threshold
- WHEN a visitor searches with filters that would otherwise match it
- THEN the hidden listing does not appear in the results

### Requirement: Publisher Type Visible in Results

The system MUST display each result's `publisher_type` (owner or broker) alongside its other summary information.

#### Scenario: Search result shows publisher type

- GIVEN a search returning at least one listing
- WHEN the results are displayed
- THEN each result visibly shows whether its publisher is an `owner` or a `broker`
