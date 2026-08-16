import type { AuthenticatedSession, SessionPort } from "./ports/session.port";

/**
 * account-identity spec, Requirement: Authenticated Session Required for
 * Protected Actions. Thrown for both "never signed in" and "session
 * expired" — see require-authenticated-session.test.ts for why those two
 * scenarios collapse to one check. A delivery adapter (e.g. app/(auth)) is
 * responsible for turning this into an HTTP redirect; this layer only
 * decides whether the action may proceed.
 */
export class UnauthenticatedError extends Error {
  constructor() {
    super("No authenticated session.");
    this.name = "UnauthenticatedError";
  }
}

/**
 * The one guard every protected action calls before doing anything else —
 * "guarantees live in the narrowest API" (design.md, Technical Approach).
 * Publish a listing, reveal a contact, or any future protected action: all
 * of them require an `AuthenticatedSession`, and none of them can obtain
 * one without going through this function first.
 */
export async function requireAuthenticatedSession(
  sessionPort: SessionPort,
): Promise<AuthenticatedSession> {
  const session = await sessionPort.getSession();

  if (!session) {
    throw new UnauthenticatedError();
  }

  return session;
}
