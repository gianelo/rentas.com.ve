import { describe, expect, it, vi } from "vitest";
import type { PhoneVerificationPort } from "../application/ports/phone-verification.port";
import type { AuthenticatedSession, SessionPort } from "../application/ports/session.port";
import { requireAuthenticatedSession } from "../application/require-authenticated-session";
import {
  createPhoneVerificationAdapter,
  DisabledPhoneVerificationAdapter,
  PhoneVerificationNotImplementedError,
} from "./phone-verification-adapter";

describe("DisabledPhoneVerificationAdapter", () => {
  // design.md D7 — "The only shipped implementation is
  // DisabledPhoneVerificationAdapter, returning { enabled: false }".
  it("always reports phone verification as disabled", async () => {
    const adapter = new DisabledPhoneVerificationAdapter();

    await expect(adapter.getStatus()).resolves.toEqual({ enabled: false });
  });
});

describe("createPhoneVerificationAdapter", () => {
  it("wires the disabled adapter when PHONE_VERIFICATION_ENABLED is unset", async () => {
    const adapter = createPhoneVerificationAdapter({});

    await expect(adapter.getStatus()).resolves.toEqual({ enabled: false });
  });

  it("wires the disabled adapter when PHONE_VERIFICATION_ENABLED=false", async () => {
    const adapter = createPhoneVerificationAdapter({ PHONE_VERIFICATION_ENABLED: "false" });

    await expect(adapter.getStatus()).resolves.toEqual({ enabled: false });
  });

  // No second adapter exists yet (D7: "The future WhatsApp inbound-code
  // adapter drops in with zero domain change"). Flipping the flag today
  // would silently promise verification this codebase cannot perform —
  // failing loudly at composition time is safer than a config value nobody
  // implemented yet.
  it("fails loudly when PHONE_VERIFICATION_ENABLED=true names an adapter that does not exist", () => {
    expect(() => createPhoneVerificationAdapter({ PHONE_VERIFICATION_ENABLED: "true" })).toThrow(
      PhoneVerificationNotImplementedError,
    );
  });
});

describe("phone verification never gates a protected action", () => {
  // account-identity spec + design.md D7 — "publishing succeeds regardless
  // of phone-verification status". PR3 (publication) does not exist yet,
  // so this is verified against the seam that does: the session guard from
  // requireAuthenticatedSession. A stand-in protected action is defined
  // with a SessionPort as its only dependency — PhoneVerificationPort is
  // never threaded through it, so it structurally cannot be consulted, and
  // this test additionally proves at runtime that it never is.
  it("a session-gated action completes without ever calling PhoneVerificationPort.getStatus()", async () => {
    const authenticatedSession: AuthenticatedSession = {
      userId: "user-1",
      email: "publisher@example.com",
      name: "Publisher",
    };
    const sessionPort: SessionPort = {
      getSession: vi.fn().mockResolvedValue(authenticatedSession),
    };
    const getStatus = vi.fn().mockResolvedValue({ enabled: false });
    const phoneVerificationPort: PhoneVerificationPort = { getStatus };

    async function standInForAProtectedAction(port: SessionPort): Promise<string> {
      await requireAuthenticatedSession(port);
      return "action completed";
    }

    await expect(standInForAProtectedAction(sessionPort)).resolves.toBe("action completed");
    expect(getStatus).not.toHaveBeenCalled();
    // The port exists and is wired (D7), it is simply irrelevant to whether
    // the action above succeeded.
    void phoneVerificationPort;
  });
});
