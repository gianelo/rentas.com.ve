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

### Requirement: Usable at Small Mobile Widths

The system MUST render search results and zone landing pages usably at a 360px viewport width with no horizontal page scrolling. Interactive targets MUST be at least 44px in their smallest dimension.

#### Scenario: No horizontal scroll at 360px

- GIVEN a viewport 360px wide
- WHEN a visitor opens the search results
- THEN the page body does not scroll horizontally

### Requirement: Results Are a Dense List, Not a Card Grid

The system MUST render search results as a single-column list of rows, where each row carries one small thumbnail alongside its text. The system MUST NOT render results as a card grid at any viewport width.

At a 360px viewport, a result row's rendered height MUST NOT exceed 96px, so that density cannot regress silently as rows accumulate content.

#### Scenario: A result row stays within its height bound

- GIVEN a search returning listings whose titles are long enough to wrap
- WHEN a result row is rendered at a 360px-wide viewport
- THEN its rendered height does not exceed 96px

#### Scenario: Desktop keeps the list form

- GIVEN a viewport 1280px wide
- WHEN search results are rendered
- THEN results remain a single-column list of rows rather than a multi-column grid of cards

### Requirement: Price Precedes Title in Reading Order

The system MUST place each result's price before its title in document order, and MUST render the price with greater visual weight than the title.

#### Scenario: Price comes first in the accessibility tree

- GIVEN a rendered result row
- WHEN its content is read in document order
- THEN the price is encountered before the title

### Requirement: Desktop Uses Width Without Stretching Content

The system MUST constrain running text and result rows to a maximum readable width at large viewports rather than expanding them to fill the window.

#### Scenario: Results stay readable at a wide viewport

- GIVEN a viewport 1280px wide or wider
- WHEN a visitor opens the search results
- THEN result rows and running text are held to a bounded width rather than spanning the full window

### Requirement: Result Summary Content

The system MUST show, for every result, at minimum: price, title, zone, and `publisher_type`.

#### Scenario: A result row carries the scannable essentials

- GIVEN a search returning at least one listing
- WHEN a result row is rendered
- THEN its price, title, zone, and publisher type are all present

### Requirement: Accessible Markup

The system MUST meet WCAG AA text contrast, expose page structure through real headings and landmarks, provide alternative text for every listing photo, and render a visible keyboard focus state on every interactive element.

#### Scenario: Listing photos are not announced as unlabelled images

- GIVEN a results page containing listing photos
- WHEN it is inspected for accessibility
- THEN every photo carries alternative text

#### Scenario: Keyboard focus is visible

- GIVEN a visitor navigating with a keyboard
- WHEN focus moves to a filter or a result link
- THEN the focused element is visibly indicated

### Requirement: Publisher Type Visible in Results

The system MUST display each result's `publisher_type` (owner or broker) alongside its other summary information.

The system MUST distinguish the two values by form rather than by colour alone: one is filled, the other is outlined. The distinction MUST remain legible when the rendering carries no colour information.

#### Scenario: Search result shows publisher type

- GIVEN a search returning at least one listing
- WHEN the results are displayed
- THEN each result visibly shows whether its publisher is an `owner` or a `broker`

#### Scenario: Publisher type survives the removal of colour

- GIVEN a results page containing both an `owner` listing and a `broker` listing
- WHEN it is rendered with all colour information removed
- THEN the two publisher-type indicators remain visually distinguishable from each other
