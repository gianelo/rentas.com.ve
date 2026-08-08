# Account Identity Specification

## Purpose

A single Google-based sign-in creates one account per person. The same account acts as publisher when creating a listing and as tenant when revealing a contact — there is no separate registration form, password, or role picker.

## Non-Goals

Password auth, SMS auth, email/password registration, phone number at signup, separate publisher/tenant account types.

## Requirements

### Requirement: Google-Only Authentication

The system MUST authenticate users exclusively through Google Sign-In. The system MUST NOT offer password-based, SMS-based, or email/password registration.

#### Scenario: Successful Google sign-in creates an account

- GIVEN a person has never signed in before
- WHEN they complete Google Sign-In successfully
- THEN the system creates one account holding their verified Google email and display name

#### Scenario: No alternate credential path exists

- GIVEN a person attempts to register or log in
- WHEN they look for a password, SMS, or email/password option
- THEN no such option is present — Google Sign-In is the only entry point

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
- THEN the system blocks the action and routes them to Google Sign-In before retrying

#### Scenario: Expired session requires re-authentication

- GIVEN a user whose session has expired or been revoked
- WHEN they attempt a protected action
- THEN the system requires a fresh Google Sign-In before the action proceeds

### Requirement: Minimal Identity Data

The system MUST capture only the verified email and display name supplied by Google at signup. The system MUST NOT require additional profile fields (phone, password, address) to complete registration.

#### Scenario: Signup completes without extra fields

- GIVEN a new Google sign-in
- WHEN the account is created
- THEN no phone number, password, or address field is requested or required
