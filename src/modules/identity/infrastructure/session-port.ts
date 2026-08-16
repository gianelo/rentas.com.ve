import type { AuthenticatedSession, SessionPort } from "../application/ports/session.port";
import { auth } from "./auth";

/**
 * The only production `SessionPort` implementation — wraps Auth.js's
 * `auth()`. `auth()` already returns `null` for both an unauthenticated
 * visitor and an expired database-strategy session (see
 * require-authenticated-session.test.ts), so no expiry logic is
 * duplicated here.
 */
export const nextAuthSessionPort: SessionPort = {
  async getSession(): Promise<AuthenticatedSession | null> {
    const session = await auth();

    if (!session?.user?.id) {
      return null;
    }

    return {
      userId: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
    };
  },
};
