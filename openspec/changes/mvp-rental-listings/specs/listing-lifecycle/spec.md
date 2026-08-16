# Listing Lifecycle Specification

## Purpose

A listing lives for 30 days, gets an automated email reminder 5 days before it lapses, and renews in one click. Expired listings vanish from search but are never destroyed. The reminder job is the MVP's only background process and must never fail silently.

## Non-Goals

Auto-renewal without user action, WhatsApp/SMS reminder channels, listing deletion, indefinite listings without expiry.

## Requirements

### Requirement: 30-Day Expiry Window

The system MUST expire a listing 30 days after its publication date or its most recent renewal date, whichever is later. The system MUST treat an expired listing as no longer active.

#### Scenario: Listing expires after 30 days without renewal

- GIVEN a listing published on day 0 with no renewal
- WHEN day 31 arrives
- THEN the listing's status is expired (no longer active)

### Requirement: Automated Pre-Expiry Reminder

The system MUST run a scheduled process, without manual triggering, that sends an email reminder to the publisher 5 days before a listing's expiry date. The reminder email MUST contain a one-click renewal link.

#### Scenario: Reminder sent 5 days before expiry

- GIVEN an active listing whose expiry date is exactly 5 days away
- WHEN the scheduled reminder process runs
- THEN an email is sent to the publisher containing a one-click renewal link for that listing

#### Scenario: No reminder for listings not nearing expiry

- GIVEN an active listing whose expiry date is more than 5 days away
- WHEN the scheduled reminder process runs
- THEN no reminder email is sent for that listing

### Requirement: One-Click Renewal

The system MUST allow a publisher to renew a listing in a single action (following the renewal link or an equivalent in-app action). A successful renewal MUST reset the listing's expiry to a full new 30-day window measured from the renewal moment.

#### Scenario: Renewal resets the 30-day window

- GIVEN a listing nearing or past its expiry date
- WHEN the publisher completes the one-click renewal
- THEN the listing's new expiry date is exactly 30 days from the renewal moment

#### Scenario: Expired listings remain renewable

- GIVEN a listing that has already expired
- WHEN the publisher completes the one-click renewal
- THEN the listing becomes active again with a full new 30-day window

### Requirement: Expired Listings Are Retained, Not Deleted

The system MUST remove an expired listing from search results while retaining its data. The system MUST NOT permanently delete a listing on expiry.

#### Scenario: Expired listing disappears from search but still exists

- GIVEN a listing that has expired
- WHEN a visitor searches with filters that would otherwise match it
- THEN it does not appear in search results, but the listing record still exists and remains renewable

#### Scenario: Renewed listing reappears in search

- GIVEN an expired listing that the publisher renews
- WHEN a visitor searches with filters that match it
- THEN the renewed listing appears in the results again

### Requirement: Expired Listing Page Retains the Visitor

The system MUST serve an expired listing's URL with a successful response that states the listing has expired, rather than returning a not-found or gone response. That page MUST show active listings from the same zone as suggestions, and MUST be excluded from search-engine indexing. The system MUST remove the expired URL from the sitemap.

#### Scenario: Visitor arriving from a search engine is offered live inventory

- GIVEN a listing that has expired and whose URL is indexed by a search engine
- WHEN a visitor opens that URL
- THEN the page loads successfully, states that the listing expired, and lists active listings from the same zone

#### Scenario: Expired listing page is not indexable

- GIVEN an expired listing page
- WHEN a search engine crawler requests it
- THEN the page instructs crawlers not to index it, and the URL is absent from the sitemap

### Requirement: Suggestions Never Cross City

The system MUST draw suggestions on an expired listing page only from the expired listing's own city. When the zone has no active listings, the system MAY widen the suggestions to other zones within the same city, and MUST NOT widen beyond that city.

#### Scenario: Empty zone widens to the city, not beyond

- GIVEN an expired `Maracaibo` listing whose zone currently has no active listings
- WHEN its page is served
- THEN any suggestions shown are active `Maracaibo` listings, and no `Distrito Capital` listing appears

#### Scenario: No suggestions rather than a cross-city suggestion

- GIVEN an expired listing whose entire city has no other active listings
- WHEN its page is served
- THEN the page shows no suggestions at all rather than offering a listing from the other city

### Requirement: Suggestions Do Not Bypass the Contact Gate

The system MUST apply the same contact-reveal gating to suggested listings that it applies everywhere else.

#### Scenario: Anonymous visitor sees suggestions without contact details

- GIVEN an anonymous visitor on an expired listing page showing suggestions
- WHEN the suggestions are rendered
- THEN no WhatsApp contact value is present for any suggested listing

### Requirement: Reminder Job Run Recording

The system MUST record each execution of the scheduled reminder process, including: the run's timestamp, the number of reminder emails successfully sent, and any failures encountered during that run (with enough detail to diagnose them). The system MUST NOT allow the job to fail without leaving a record.

#### Scenario: Successful run is recorded

- GIVEN a scheduled reminder run that sends 3 reminder emails successfully
- WHEN the run completes
- THEN a run record exists showing the run timestamp and a count of 3 reminders sent

#### Scenario: Failed run is recorded, not silent

- GIVEN a scheduled reminder run where sending one reminder email fails
- WHEN the run completes
- THEN a run record exists showing that failure (with its reason), separate from the successfully sent reminders
