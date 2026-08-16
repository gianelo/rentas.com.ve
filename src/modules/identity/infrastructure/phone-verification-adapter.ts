import type {
  PhoneVerificationPort,
  PhoneVerificationStatus,
} from "../application/ports/phone-verification.port";

/**
 * design.md D7 — the only shipped `PhoneVerificationPort` implementation.
 * Registration never awaits verification in the MVP; there is no
 * `if (enabled)` branch anywhere upstream of this file, in application or
 * domain code, because the port's contract (`getStatus()`) is purely
 * informational and nothing consumes it to gate an action (see
 * phone-verification-adapter.test.ts, "phone verification never gates a
 * protected action").
 */
export class DisabledPhoneVerificationAdapter implements PhoneVerificationPort {
  async getStatus(): Promise<PhoneVerificationStatus> {
    return { enabled: false };
  }
}

export class PhoneVerificationNotImplementedError extends Error {
  constructor(value: string) {
    super(
      `PHONE_VERIFICATION_ENABLED=${value} names a phone-verification adapter that does not exist yet ` +
        '(design.md D7: only DisabledPhoneVerificationAdapter ships in the MVP). Set it to "false" or leave it unset.',
    );
    this.name = "PhoneVerificationNotImplementedError";
  }
}

/**
 * Composition-time selection, driven by `PHONE_VERIFICATION_ENABLED`
 * (design.md D7). Today the flag has exactly one honest outcome — the
 * disabled adapter — because no other adapter is implemented; setting it
 * to `"true"` fails loudly rather than silently pretending verification
 * runs. The future WhatsApp adapter (D7) is selected here, and only here,
 * with zero change to any caller of `PhoneVerificationPort`.
 */
export function createPhoneVerificationAdapter(
  env: Record<string, string | undefined> = process.env,
): PhoneVerificationPort {
  const flag = env.PHONE_VERIFICATION_ENABLED ?? "false";

  if (flag !== "false") {
    throw new PhoneVerificationNotImplementedError(flag);
  }

  return new DisabledPhoneVerificationAdapter();
}
