/**
 * account-identity spec, Requirement: Authenticated Session Required for
 * Protected Actions — the narrowest shape a protected action needs to know
 * about the current visitor. Deliberately holds nothing beyond identity:
 * no role, no permission flag, no phone-verification status. A caller that
 * needs more than "who is this" composes another port instead of this one
 * growing a second responsibility.
 */
export interface AuthenticatedSession {
  userId: string;
  email: string | null;
  name: string | null;
}

/**
 * `getSession()` returns `null` for both a visitor who never signed in and
 * a visitor whose session has expired or been revoked — Auth.js's own
 * database-strategy adapter already deletes an expired session row and
 * reports it as absent (see @auth/core's session action), so this port
 * never has to distinguish "never authenticated" from "no longer
 * authenticated". One port method, one guarantee.
 */
export interface SessionPort {
  getSession(): Promise<AuthenticatedSession | null>;
}
