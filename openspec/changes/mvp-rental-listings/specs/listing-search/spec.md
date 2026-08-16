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

### Requirement: Indexable Zone Landing Pages

The system MUST expose a crawlable, server-rendered landing page for every (city, zone) pair in the curated taxonomy, listing that zone's active listings. Each landing page MUST be reachable by a search-engine crawler without JavaScript execution and MUST appear in the sitemap.

#### Scenario: Zone landing page renders without client-side scripting

- GIVEN a curated zone with active listings
- WHEN a crawler requests that zone's landing page and executes no JavaScript
- THEN the response body already contains that zone's active listings

#### Scenario: Zone landing page respects city isolation

- GIVEN a zone landing page for a `Maracaibo` zone
- WHEN it is rendered
- THEN every listing shown has `city = Maracaibo`

### Requirement: Linkable, Keyword-Bearing URLs

The system MUST place city and zone in the URL path for listing and zone pages, and MUST express search filters as query parameters so that a filtered search can be copied, shared, and reopened with the same results.

#### Scenario: A shared filtered search reproduces its results

- GIVEN a visitor who applied city, zone, and price filters
- WHEN they copy the resulting URL and another visitor opens it
- THEN the second visitor sees the same filter selection applied

### Requirement: Search Results Are Server-Rendered

The system MUST render search results on the server. The system MUST NOT require client-side JavaScript to produce, filter, or paginate the result list.

#### Scenario: Results are present with scripting disabled

- GIVEN a visitor whose browser does not execute JavaScript
- WHEN they submit a search
- THEN the results are present in the served response

### Requirement: Publisher Type Visible in Results

The system MUST display each result's `publisher_type` (owner or broker) alongside its other summary information.

#### Scenario: Search result shows publisher type

- GIVEN a search returning at least one listing
- WHEN the results are displayed
- THEN each result visibly shows whether its publisher is an `owner` or a `broker`
