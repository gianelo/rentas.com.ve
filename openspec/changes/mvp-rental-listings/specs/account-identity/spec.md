# Account Identity Specification

## Purpose

One account per person, reached through one of two doors: Google Sign-In or a passwordless magic link sent by email (Phase 15, F16/F17). The same account acts as publisher when creating a listing and as tenant when revealing a contact — there is no separate registration form, password, or role picker, regardless of which door was used.

## Non-Goals

Password auth, SMS auth, email/password (credentials) registration, phone number at signup, separate publisher/tenant account types, a "must open on the same device" restriction on the magic link (considered and explicitly rejected — see tasks.md 15.6: it would make sign-in from a desktop impossible whenever the mail is read on a phone, which the founder's own flow treats as the normal case, not an edge case).

## Requirements

### Requirement: Two Authentication Doors

The system MUST authenticate users through exactly two doors: Google Sign-In, and a magic link sent to an email address. The system MUST NOT offer password-based, SMS-based, or email/password (credentials) authentication.

#### Scenario: Successful Google sign-in creates an account

- GIVEN a person has never signed in before
- WHEN they complete Google Sign-In successfully
- THEN the system creates one account holding their verified Google email and display name

#### Scenario: Successful magic-link sign-in creates an account

- GIVEN a person has never signed in before
- WHEN they request a magic link for their email address and open it before it expires
- THEN the system creates one account holding that email address, with no display name and no picture — the magic link carries only an email, unlike Google's profile

#### Scenario: No alternate credential path exists

- GIVEN a person attempts to register or log in
- WHEN they look for a password, SMS, or combined email/password option
- THEN no such option is present — Google Sign-In and the magic link are the only two entry points

### Requirement: Magic Link Is Single-Use and Time-Boxed

The system MUST invalidate a magic link after its first successful use. The system MUST reject a magic link once 15 minutes have passed since it was requested, rather than the identity provider's longer default.

#### Scenario: A used link cannot sign in a second time

- GIVEN a magic link that has already been used to sign in once
- WHEN the same link is opened again
- THEN the system refuses it — the underlying verification token was consumed on first use and no longer exists

#### Scenario: An expired link is refused

- GIVEN a magic link requested more than 15 minutes ago and never used
- WHEN it is opened
- THEN the system refuses it as expired, regardless of which device or browser opens it

#### Scenario: The link is not restricted to the requesting device

- GIVEN a magic link requested from one device (e.g. a desktop browser)
- WHEN it is opened from a different device (e.g. the phone whose mail app received it)
- THEN the system signs the person in — same-device enforcement was considered and rejected (tasks.md 15.6), because reading mail on a phone while browsing on a desktop is the normal case this door exists to serve, not an exception to guard against

### Requirement: Single Account, Contextual Role

The system MUST use one account type for both publisher and tenant actions. The system MUST NOT require a role selection at signup.

#### Scenario: Same account publishes and reveals

- GIVEN a signed-in user
- WHEN that user publishes a listing and later reveals another listing's contact
- THEN both actions are performed under the same single account, with no separate registration step between them

### Requirement: Authenticated Session Required for Protected Actions

The system MUST require an authenticated session before allowing listing publication or contact reveal.

#### Scenario: Unauthenticated user is redirected to sign-in

- GIVEN a visitor with no active session
- WHEN they attempt to publish a listing or reveal a contact
- THEN the system blocks the action and routes them to sign in — through either door — before retrying

#### Scenario: Expired session requires re-authentication

- GIVEN a user whose session has expired or been revoked
- WHEN they attempt a protected action
- THEN the system requires a fresh sign-in, through either door, before the action proceeds

### Requirement: Minimal Identity Data

The system MUST capture only the identity data each door actually supplies at signup, and MUST NOT require additional profile fields (phone, password, address) to complete registration. Google supplies a verified email and a display name; the magic link supplies only an email.

#### Scenario: Google signup completes without extra fields

- GIVEN a new Google sign-in
- WHEN the account is created
- THEN no phone number, password, or address field is requested or required

#### Scenario: Magic-link signup captures even less, by construction

- GIVEN a new magic-link sign-in
- WHEN the account is created
- THEN the account holds an email and nothing else identity-related — there is no display name to omit, because the magic link never carried one; a surface that expects a name (e.g. an account menu) must have a fallback for this account shape rather than assume Google's fuller profile
