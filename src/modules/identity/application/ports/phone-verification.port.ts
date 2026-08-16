/**
 * design.md D7 — "Phone verification: port with no adapter". The contract is
 * deliberately informational: it reports a status and exposes no method that
 * throws, rejects, or blocks. A port shaped like `assertVerified()` invites a
 * caller to gate on it; `getStatus()` does not.
 *
 * Being precise about the strength of that, because this codebase draws a
 * hard line between a guarantee and a convention: this shape *discourages*
 * gating, it does not *prevent* it. `if (!(await port.getStatus()).enabled)
 * throw` is one line away. Compare a real structural guarantee elsewhere —
 * `PhotoHashPort.findMatchesFromOtherPublishers(hash, excludePublisherId)`
 * makes the publisher exclusion a required argument, so the unsafe query
 * cannot be written at all.
 *
 * What actually holds the requirement "publishing succeeds regardless of
 * phone-verification status" is narrower and worth stating plainly: **no use
 * case receives this port.** A dependency that is never injected cannot be
 * branched on. If a future slice ever passes `PhoneVerificationPort` into
 * `PublishListingUseCase`, that — not this interface — is the moment the
 * guarantee is lost.
 */
export interface PhoneVerificationStatus {
  enabled: boolean;
}

export interface PhoneVerificationPort {
  getStatus(): Promise<PhoneVerificationStatus>;
}
