import { redirect } from "next/navigation";
import type { AuthenticatedSession } from "@/modules/identity/application/ports/session.port";
import {
  requireAuthenticatedSession,
  UnauthenticatedError,
} from "@/modules/identity/application/require-authenticated-session";
import { nextAuthSessionPort } from "@/modules/identity/infrastructure/session-port";

/**
 * Thin delivery adapter (design.md, Technical Approach) — the one place a
 * protected route or server action turns "no session"
 * (`UnauthenticatedError`, application layer) into an HTTP redirect to
 * `/signin`. No business rule lives here: what counts as "authenticated"
 * is decided entirely by `requireAuthenticatedSession`. Future protected
 * actions (publish in PR3, contact reveal in PR6) call this first.
 */
export async function requireSession(callbackUrl?: string): Promise<AuthenticatedSession> {
  try {
    return await requireAuthenticatedSession(nextAuthSessionPort);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect(callbackUrl ? `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/signin");
    }
    throw error;
  }
}
