import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedSession, SessionPort } from "./ports/session.port";
import { requireAuthenticatedSession, UnauthenticatedError } from "./require-authenticated-session";

const authenticatedSession: AuthenticatedSession = {
  userId: "user-1",
  email: "tenant@example.com",
  name: "Jane Doe",
};

function fakeSessionPort(session: AuthenticatedSession | null): SessionPort {
  return { getSession: vi.fn().mockResolvedValue(session) };
}

describe("requireAuthenticatedSession", () => {
  // account-identity spec, Requirement: Authenticated Session Required for
  // Protected Actions — "Unauthenticated user is redirected to sign-in".
  // The guard itself never redirects (that is a Next.js delivery concern,
  // see app/(auth)/signin); it only draws the one line a protected action
  // needs: authenticated, or not.
  it("throws UnauthenticatedError for a visitor with no active session", async () => {
    const sessionPort = fakeSessionPort(null);

    await expect(requireAuthenticatedSession(sessionPort)).rejects.toThrow(UnauthenticatedError);
  });

  it("returns the session for an authenticated visitor", async () => {
    const sessionPort = fakeSessionPort(authenticatedSession);

    await expect(requireAuthenticatedSession(sessionPort)).resolves.toEqual(authenticatedSession);
  });

  // account-identity spec, Requirement: Authenticated Session Required for
  // Protected Actions — "Expired session requires re-authentication". No
  // separate expiry branch exists here: Auth.js's database-strategy adapter
  // already deletes an expired session and reports it as absent (verified
  // against @auth/core's session action, which compares `session.expires`
  // to `Date.now()` before this port is ever asked), so a `SessionPort`
  // backing an expired session behaves identically to one backing a visitor
  // who never signed in — both resolve `null`. One check covers both
  // scenarios in the spec; a second branch here would be a rule this guard
  // could get out of sync with the framework's own behaviour.
  it("throws UnauthenticatedError for an expired session, forcing the same re-auth path", async () => {
    const sessionPort = fakeSessionPort(null);

    await expect(requireAuthenticatedSession(sessionPort)).rejects.toThrow(UnauthenticatedError);
  });
});
