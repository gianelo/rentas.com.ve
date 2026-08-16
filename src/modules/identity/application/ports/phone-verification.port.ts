/**
 * design.md D7 — "Phone verification: port with no adapter". The contract
 * is deliberately informational only: it reports a status, it does not
 * expose any method that could throw, reject, or otherwise block a caller.
 * A port shaped like `assertVerified()` would let a future caller branch on
 * phone verification without meaning to; a port shaped like `getStatus()`
 * cannot gate anything by construction — the caller has to go out of its
 * way to turn "false" into a rejection, and nothing in this codebase does.
 */
export interface PhoneVerificationStatus {
  enabled: boolean;
}

export interface PhoneVerificationPort {
  getStatus(): Promise<PhoneVerificationStatus>;
}
