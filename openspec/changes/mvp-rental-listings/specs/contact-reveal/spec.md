# Contact Reveal Specification

## Purpose

A publisher's WhatsApp contact stays hidden until a registered tenant reveals it. Every reveal is recorded as an append-only event, countable over time, per city, and per listing. The north-star metric reported for the 6-month go/pivot decision is the count of unique (tenant, listing) pairs revealed — not the raw action count — so repeat views by the same tenant cannot inflate the signal. Revealing costs the tenant a written message to the publisher, and one account may reveal at most 40 distinct listings in any rolling 24 hours.

## Non-Goals

In-app chat, visit scheduling, contact reveal without authentication, deduplicating raw reveal event records (the events themselves are append-only; only the north-star metric derived from them is deduplicated). The message a tenant writes at reveal time is a one-way handoff into the publisher's own messaging application — this product does not host the conversation, store its thread, or deliver replies.

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

The system MUST record a reveal event each time a tenant reveals a listing's contact. Each event MUST capture, at minimum: the listing identifier, the listing's city, the publisher identifier, the revealing tenant's identifier, the message the tenant submitted with the reveal, and a timestamp. The system MUST support counting these events over time, filtered by city, and filtered by listing.

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

### Requirement: Reveal Requires a Message to the Publisher

The system MUST require the revealing tenant to submit a message addressed to the publisher as part of the reveal action. A reveal submitted without a message MUST be refused: the system MUST NOT disclose the contact value and MUST NOT record a reveal event for it. The system MUST store the submitted message with the reveal event as the authoritative record of what the tenant wrote, and MUST NOT depend on any external messaging application to report what was ultimately sent. The system MUST carry the submitted message into the contact action handed to the tenant, already written, so the tenant does not retype it.

#### Scenario: Reveal without a message is refused

- GIVEN a signed-in tenant on a listing detail page with the contact still hidden
- WHEN they trigger the reveal action without writing a message
- THEN the contact value is not disclosed, no reveal event is recorded, and the tenant is asked for a message

#### Scenario: The submitted message is stored with the reveal event

- GIVEN a signed-in tenant who writes a message and triggers the reveal action
- WHEN the reveal completes
- THEN the reveal event records that message alongside the listing id, city, publisher id, tenant id, and timestamp

#### Scenario: The stored message survives whatever happens in the external application

- GIVEN a tenant who revealed a contact with a stored message and then edited or discarded the pre-written text inside the external messaging application
- WHEN the reveal record is read afterwards
- THEN it still holds the message exactly as submitted, because no external application reports back what was sent and the stored record is the only evidence

#### Scenario: The contact action opens with the submitted message already written

- GIVEN a tenant who has just revealed a listing's contact with a message
- WHEN they open the contact action for that listing
- THEN the publisher's messaging application opens addressed to that publisher with the submitted message already written

### Requirement: Per-Account Reveal Rate Limit

The system MUST limit how many **distinct listings** one account can reveal within a rolling 24-hour window, and MUST refuse further reveals for that account once the limit is reached. The limit is **40 distinct listings per rolling 24 hours**. Revealing a listing the account has already revealed inside the window MUST NOT consume further allowance, because the rule exists to keep the catalogue from being drained and not to charge a tenant for comparing the same advert twice. The window MUST roll continuously rather than reset on a calendar boundary. A refused reveal MUST NOT disclose the contact value and MUST NOT record a reveal event.

#### Scenario: An account below the limit reveals normally

- GIVEN a signed-in tenant whose account has revealed fewer than 40 distinct listings in the last 24 hours
- WHEN they reveal another listing's contact with a message
- THEN the contact is disclosed and the reveal event is recorded

#### Scenario: An account at the limit is refused

- GIVEN a signed-in tenant whose account has revealed 40 distinct listings within the last 24 hours
- WHEN they attempt to reveal the contact of a listing they have not revealed in that window
- THEN the reveal is refused, the contact value is not disclosed, and no reveal event is recorded

#### Scenario: Repeat reveals of an already-revealed listing consume no allowance

- GIVEN a signed-in tenant whose account has revealed 40 distinct listings within the last 24 hours
- WHEN they reveal again a listing already among those 40 inside the window
- THEN the reveal is allowed and recorded, because the account's count of distinct listings has not grown

#### Scenario: Allowance returns as the window rolls forward

- GIVEN an account refused a reveal because 40 distinct listings fell inside its trailing 24-hour window
- WHEN enough time passes that some of those reveals are older than 24 hours
- THEN the account may reveal again, without waiting for any scheduled reset

#### Scenario: A refused reveal leaks nothing into the metric

- GIVEN an account refused a reveal for exceeding the limit
- WHEN the north-star unique-pair count and the raw action count are computed
- THEN neither figure includes the refused attempt
