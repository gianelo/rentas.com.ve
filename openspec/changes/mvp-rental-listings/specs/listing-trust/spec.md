# Listing Trust Specification

## Purpose

Trust is enforced at zero cost: perceptual photo-hash matching blocks stolen photos across accounts (but never blocks an honest owner reusing their own photos), community reports auto-hide abusive listings, and phone verification exists only as a disabled contract for later.

## Non-Goals

Any active phone/SMS/WhatsApp verification adapter, manual photo review queue, appeal workflow beyond operator restore.

## Requirements

### Requirement: Cross-Account Duplicate Photo Rejection

The system MUST compute a perceptual hash for each photo submitted at publish time and MUST reject the listing submission when a submitted photo perceptually matches a photo already in the system that belongs to a **different** publisher account.

#### Scenario: Photo stolen from another publisher is rejected

- GIVEN publisher A has an existing listing with a photo already stored in the system
- WHEN publisher B submits a new listing containing a photo that perceptually matches publisher A's photo
- THEN the system rejects publisher B's submission and creates no listing

### Requirement: Same-Publisher Photo Reuse Exemption

The system MUST allow a photo to be reused when the perceptually matching existing photo belongs to the **same** publisher account submitting the new or renewed listing. This exemption MUST apply regardless of whether the matching photo belongs to an active, expired, or previously published listing.

#### Scenario: Owner republishes their own expired listing with the same photos

- GIVEN publisher A has an expired listing whose photos are already stored in the system under publisher A's account
- WHEN publisher A republishes or renews that listing reusing the same photos
- THEN the system allows the submission — the same-account match does not trigger rejection

#### Scenario: Owner reuses a photo from a different one of their own active listings

- GIVEN publisher A has photo P stored under an existing active listing
- WHEN publisher A submits a second, different listing reusing photo P
- THEN the system allows the submission because both listings belong to the same publisher account

### Requirement: Authenticated Reporting

The system MUST allow any authenticated user to report a listing, and MUST NOT allow an unauthenticated visitor to report.

#### Scenario: Unauthenticated visitor cannot report

- GIVEN a visitor with no active session viewing a listing
- WHEN they attempt to report it
- THEN the system blocks the action and requires sign-in first

### Requirement: Auto-Hide After Three Distinct Reports

The system MUST auto-hide a listing from search once it has received reports from 3 distinct authenticated accounts. The system MUST count at most one report per account per listing toward this threshold.

#### Scenario: Third distinct reporter triggers auto-hide

- GIVEN a listing that already has reports from 2 distinct accounts
- WHEN a 3rd distinct authenticated account reports the same listing
- THEN the listing is immediately auto-hidden and excluded from search results

#### Scenario: Repeated reports from the same account do not trigger auto-hide alone

- GIVEN a listing with a report from 1 distinct account
- WHEN that same account reports the listing again
- THEN the report count toward auto-hide remains at 1, and the listing is not hidden

### Requirement: Operator Restore

The system MUST allow the operator to restore an auto-hidden listing back to active status.

#### Scenario: Operator restores a wrongly hidden listing

- GIVEN a listing that was auto-hidden after reaching the report threshold
- WHEN the operator restores it
- THEN the listing becomes searchable again (provided it has not also expired)

### Requirement: Phone Verification Port (Disabled)

The system MUST define a phone verification contract — accepting an account identifier and a phone number, and returning a verification status of `unverified`, `pending`, or `verified` — without implementing any adapter. The contract MUST remain disabled in the MVP: no publish, reveal, or reporting action MAY depend on its output.

#### Scenario: Publish succeeds without phone verification

- GIVEN the phone verification contract exists but has no active adapter
- WHEN a publisher publishes a listing
- THEN the publish succeeds regardless of any phone verification status

#### Scenario: Contract accepts input without triggering external communication

- GIVEN the disabled phone verification contract
- WHEN it is invoked with an account identifier and phone number
- THEN it returns a status without sending any SMS, WhatsApp message, or other external communication
