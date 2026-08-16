# Listing Publication Specification

## Purpose

A signed-in user publishes a long-stay residential listing in USD, with an explicit and always-visible publisher type. Nothing is inferred or converted. Multi-listing loading is not part of this capability: it lives in `broker-bulk-import`, which reuses this capability's use cases rather than bypassing them.

## Non-Goals

Short-stay/tourist listings, commercial listings, multi-currency or bolivar conversion, visit scheduling. Bulk/CSV import is specified in `broker-bulk-import`.

## Requirements

### Requirement: Authenticated Publication Only

The system MUST require an authenticated session to create or edit a listing.

#### Scenario: Anonymous user cannot publish

- GIVEN a visitor with no active session
- WHEN they attempt to submit a new listing
- THEN the system rejects the submission and requires sign-in first

### Requirement: Mandatory, Non-Inferred Publisher Type

The system MUST require an explicit `publisher_type` value of either `owner` or `broker` for every listing, with no default value. The system MUST NOT infer `publisher_type` from any other data. The system MUST display `publisher_type` on every view of the listing (search result and detail). For listings created by bulk import, `publisher_type` MUST be derived from the importing account and MUST NOT be readable from the uploaded file.

#### Scenario: Missing publisher type is rejected

- GIVEN a publisher filling the listing form
- WHEN they submit without selecting `owner` or `broker`
- THEN the system rejects the submission with a validation error and creates no listing

#### Scenario: Publisher type is visible everywhere the listing appears

- GIVEN a published listing with `publisher_type = broker`
- WHEN any visitor views that listing in a search result or on its detail page
- THEN "broker" is visibly displayed alongside the listing

### Requirement: USD-Only Price

The system MUST store price as a single numeric field in USD. The system MUST NOT offer a currency selector or apply any exchange-rate conversion.

#### Scenario: Non-numeric or negative price is rejected

- GIVEN a publisher entering a price
- WHEN they submit a non-numeric value or a negative number
- THEN the system rejects the submission

#### Scenario: Listing stores exactly one USD amount

- GIVEN a successfully published listing
- WHEN its price is read back
- THEN only one numeric USD value exists — no currency field or converted amount is present

### Requirement: Restricted City Selection

The system MUST restrict `city` to exactly two values: `Distrito Capital` and `Maracaibo`.

#### Scenario: City outside the launch set is rejected

- GIVEN a publisher submitting a listing
- WHEN they select or send a city other than `Distrito Capital` or `Maracaibo`
- THEN the system rejects the submission

### Requirement: Curated Zone Selection

The system MUST require `zone` to be selected from a curated list scoped to the chosen `city`. The system MUST NOT accept free-text zone input.

#### Scenario: Zone outside the city's curated list is rejected

- GIVEN a publisher who selected `city = Maracaibo`
- WHEN they submit a `zone` value that is not in Maracaibo's curated zone list (including a zone valid only for `Distrito Capital`)
- THEN the system rejects the submission

#### Scenario: Zone options follow the selected city

- GIVEN a publisher who has selected a city
- WHEN they open the zone selector
- THEN only that city's curated zones are offered

### Requirement: Long-Stay Residential Only

The system MUST scope listing creation to long-stay residential rentals. The system MUST NOT expose fields, categories, or flows for short-stay, tourist, or commercial listings.

#### Scenario: No short-stay or commercial option exists

- GIVEN a publisher creating a listing
- WHEN they look for a rental-type selector
- THEN no short-stay, tourist, or commercial option is present in the form

### Requirement: Uniform Validation Across Every Entry Path

The system MUST apply identical validation and trust rules to a listing regardless of how it was created. A listing originating from bulk import MUST satisfy every requirement in this specification — publisher type, USD-only price, restricted city, curated zone, long-stay residential scope, and minimum publishable content — before it can become active. Bulk import MUST NOT expose an alternate write path that bypasses this capability's use cases.

#### Scenario: Bulk-imported listing is held to the same rules

- GIVEN a broker importing a row whose `zone` is not in the curated list for its `city`
- WHEN the import is processed
- THEN that row is rejected with the same validation rule the single-listing flow applies, and no listing is created for it

#### Scenario: Bulk import cannot bypass minimum publishable content

- GIVEN a listing created as a draft by bulk import with no photo attached
- WHEN activation is attempted
- THEN the system refuses to activate it until at least one photo is attached and passes trust checks

### Requirement: Minimum Publishable Content

The system MUST require, at minimum, a title, description, price, city, zone, `publisher_type`, and at least one photo before a listing can be published.

#### Scenario: Listing without a photo cannot be published

- GIVEN a publisher who has filled all fields except a photo
- WHEN they submit the listing
- THEN the system rejects the submission until at least one photo is attached
