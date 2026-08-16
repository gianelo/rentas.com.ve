# Voluntary Contribution Specification

## Purpose

The product is free and stays free. A Wikipedia-style dismissible invitation asks visitors to support it voluntarily, and sends them to an external payment destination. No money moves through the product, and no feature is ever withheld from anyone who does not contribute.

## Non-Goals

In-app payment processing, card or crypto handling, contributor accounts, receipts, recurring billing, contribution amounts stored against a user, any paywall or feature gating, advertising.

## Requirements

### Requirement: The Product Remains Fully Free

The system MUST NOT condition any capability — publishing, searching, revealing contact, importing, expiring, or renewing — on whether a contribution was made. The system MUST NOT record whether a given user contributed.

#### Scenario: Non-contributor retains full access

- GIVEN a registered tenant who has dismissed every contribution invitation and never contributed
- WHEN they search listings and reveal a publisher's contact
- THEN both succeed exactly as they do for any other registered tenant

### Requirement: The Invitation Never Blocks a Flow

The system MUST render the contribution invitation as a dismissible, non-modal element. The system MUST NOT interrupt, delay, or overlay the publish flow, the search results, or the contact reveal.

#### Scenario: Contact reveal is never interrupted by the invitation

- GIVEN a registered tenant on a listing detail page with the contribution invitation displayed
- WHEN they trigger the contact reveal
- THEN the WhatsApp contact is revealed without any contribution prompt appearing in between

#### Scenario: Dismissal is respected

- GIVEN a visitor who dismisses the invitation
- WHEN they continue browsing during that session
- THEN the invitation is not shown again for the remainder of the session

### Requirement: Server-Controlled Contribution Destination

The system MUST resolve the external contribution destination from server-side configuration only. The system MUST NOT accept a destination, wallet, account, or redirect target from any request parameter, path segment, or client-supplied value.

#### Scenario: Attacker-supplied destination is ignored

- GIVEN a crafted link to the contribution page carrying a destination parameter pointing at an attacker's account
- WHEN the page is opened
- THEN the system ignores the supplied value and presents only the configured destination

#### Scenario: Destination is disclosed before the visitor leaves

- GIVEN a visitor on the contribution page
- WHEN they view it
- THEN the payment method and destination are shown on the page itself, so the visitor can recognise the legitimate destination before leaving the site

### Requirement: No Payment Data Enters the System

The system MUST NOT collect, transmit, or store card numbers, wallet keys, or any payment credential. Contribution MUST be completed entirely on the external provider.

#### Scenario: No payment fields exist

- GIVEN a visitor on the contribution page
- WHEN they look for a way to enter payment details
- THEN no such field exists, and the page offers only a link or code directing them to the external provider

### Requirement: Contribution Is Not the North-Star Metric

The system MUST keep contact reveals as the reported north-star metric. Contribution activity MUST NOT be presented as, or substituted for, the go/pivot measurement.

#### Scenario: Go/pivot reporting is unaffected

- GIVEN contribution activity has occurred
- WHEN the six-month go/pivot figures are produced
- THEN they report unique tenant-listing contact reveals, unchanged by any contribution data
