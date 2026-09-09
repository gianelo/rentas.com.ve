import { describe, expect, it, vi } from "vitest";
import { runHeartbeat } from "./run-heartbeat";

const URL = "https://rentoru.com/api/health";
const NOTIFY_TO = "fundador@rentoru.com";

function fakeMailer() {
  const send = vi.fn().mockResolvedValue(undefined);
  return { send };
}

describe("runHeartbeat", () => {
  it("no manda ningún correo cuando la base contesta 200", async () => {
    const mailer = fakeMailer();

    const result = await runHeartbeat({
      checkHealth: async () => ({ status: 200 }),
      mailer,
      url: URL,
      notifyTo: NOTIFY_TO,
    });

    expect(result.outcome).toBe("alive");
    expect(result.notified).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("manda el aviso de falla cuando la ruta contesta un status distinto de 200", async () => {
    const mailer = fakeMailer();

    const result = await runHeartbeat({
      checkHealth: async () => ({ status: 503 }),
      mailer,
      url: URL,
      notifyTo: NOTIFY_TO,
      now: () => new Date("2026-09-08T12:00:00Z"),
    });

    expect(result.outcome).toBe("dead");
    expect(result.notified).toBe(true);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: NOTIFY_TO, subject: expect.any(String) }),
    );
  });

  it("manda el aviso también cuando el pedido nunca volvió con un status (inalcanzable)", async () => {
    const mailer = fakeMailer();

    const result = await runHeartbeat({
      checkHealth: async () => ({ status: "unreachable" }),
      mailer,
      url: URL,
      notifyTo: NOTIFY_TO,
    });

    expect(result.outcome).toBe("dead");
    expect(result.notified).toBe(true);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });
});
