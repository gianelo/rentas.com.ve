import { describe, expect, it } from "vitest";
import { composeHeartbeatFailureNotice, heartbeatOutcome } from "./heartbeat";

describe("heartbeatOutcome", () => {
  it("is alive only on exactly 200", () => {
    expect(heartbeatOutcome(200)).toBe("alive");
  });

  it("is dead on any non-200 status, not only 5xx", () => {
    // 404 is deliberately included: a health route that moved or was
    // misconfigured is just as silent a failure as a 500 would be.
    for (const status of [500, 503, 404, 401, 301]) {
      expect(heartbeatOutcome(status)).toBe("dead");
    }
  });
});

describe("composeHeartbeatFailureNotice", () => {
  const CHECKED_AT = new Date("2026-09-08T12:34:00Z");

  it("names the url and the status that failed", () => {
    const notice = composeHeartbeatFailureNotice({
      url: "https://rentoru.com/api/health",
      status: 503,
      checkedAt: CHECKED_AT,
    });

    expect(notice.subject).not.toBe("");
    expect(notice.body).toContain("https://rentoru.com/api/health");
    expect(notice.body).toContain("503");
  });

  it("says 'unreachable' rather than a status number when the request never got one", () => {
    const notice = composeHeartbeatFailureNotice({
      url: "https://rentoru.com/api/health",
      status: "unreachable",
      checkedAt: CHECKED_AT,
    });

    expect(notice.body).not.toMatch(/\bunreachable\b.*\d{3}/);
    expect(notice.body.toLowerCase()).toContain("no respondió");
  });

  // The failure this task exists to end never had a spending number to show
  // — the whole point is that the notice reports the CONSEQUENCE, not a
  // quota percentage nobody's plan can compute.
  it("never claims to know a quota percentage", () => {
    const notice = composeHeartbeatFailureNotice({
      url: "https://rentoru.com/api/health",
      status: 503,
      checkedAt: CHECKED_AT,
    });

    expect(notice.body).not.toMatch(/%/);
  });
});
