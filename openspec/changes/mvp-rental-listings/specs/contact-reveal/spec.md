# Contact Reveal Specification

## Purpose

A publisher's WhatsApp contact stays hidden until a registered tenant reveals it. Every reveal is recorded as an append-only event, countable over time, per city, and per listing. The north-star metric reported for the 6-month go/pivot decision is the count of unique (tenant, listing) pairs revealed — not the raw action count — so repeat views by the same tenant cannot inflate the signal.

## Non-Goals

In-app chat, visit scheduling, contact reveal without authentication, deduplicating raw reveal event records (the events themselves are append-only; only the north-star metric derived from them is deduplicated).

## Requirements

### Requirement: Contact Hidden from Anonymous Visitors

The system MUST hide the publisher's WhatsApp contact from any visitor without an authenticated session.

#### Scenario: Anonymous visitor sees no contact value

- GIVEN a visitor with no active session viewing a listing detail page
- WHEN they look for the publisher's WhatsApp contact
- THEN the contact is not shown — a hidden/locked placeholder is displayed instead

### Requirement: Reveal Requires Authenticated Tenant

The system MUST require an authenticated session before revealing a listing's WhatsApp contact. The system MUST prompt sign-in when an unauthenticated visitor attempts to reveal.

#### Scenario: Unauthenticated reveal attempt prompts sign-in

- GIVEN a visitor with no active session on a listing detail page
- WHEN they trigger the reveal action
- THEN the system blocks the reveal and routes them to Google Sign-In before allowing a retry

#### Scenario: Authenticated tenant sees the contact after reveal

- GIVEN a signed-in user viewing a listing detail page with the contact still hidden
- WHEN they trigger the reveal action
- THEN the system makes the publisher's WhatsApp contact value visible to them

### Requirement: Every Reveal Is Recorded as a Countable Event

The system MUST record a reveal event each time a tenant reveals a listing's contact. Each event MUST capture, at minimum: the listing identifier, the listing's city, the publisher identifier, the revealing tenant's identifier, and a timestamp. The system MUST support counting these events over time, filtered by city, and filtered by listing.

#### Scenario: A reveal creates one event record

- GIVEN an authenticated tenant revealing a listing's contact for the first time
- WHEN the reveal completes
- THEN exactly one reveal event is recorded with the listing id, city, publisher id, tenant id, and timestamp

#### Scenario: Repeated reveals by the same tenant still count

- GIVEN a tenant who has already revealed a listing's contact once
- WHEN that same tenant reveals the same listing's contact again on a later visit
- THEN a new reveal event is recorded rather than being silently deduplicated

#### Scenario: Reveal counts are queryable per city and per listing

- GIVEN reveal events exist across both launch cities and multiple listings
- WHEN the reveal count is requested for one city or for one listing
- THEN the result reflects only events matching that city or that listing

### Requirement: North-Star Metric Is Unique Tenant-Listing Pairs

The system MUST derive the north-star metric reported for the 6-month go/pivot decision as the count of **unique (tenant, listing) pairs** with at least one reveal event, not the raw count of reveal actions. Raw action counts MUST remain derivable from the recorded events for operational purposes, but MUST NOT be presented as the north-star figure, because repeat reveals by the same tenant on the same listing would inflate the raw count and misrepresent product traction.

#### Scenario: Same tenant revealing the same listing twice counts once toward the north star

- GIVEN a tenant has already revealed a listing's contact once
- WHEN that same tenant reveals the same listing's contact again
- THEN both actions are recorded as separate reveal events, but the unique (tenant, listing) pair count used for the north-star metric increments only on the first reveal, not the second

#### Scenario: Both figures are derivable from the same event log

- GIVEN a set of recorded reveal events, including some repeat reveals by the same tenant on the same listing
- WHEN the raw action count and the unique-pair north-star count are each computed from that event log
- THEN the raw action count is greater than or equal to the unique-pair count, and both values can be produced from the same underlying events
