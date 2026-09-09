import { describe, expect, it, vi } from "vitest";
import {
  HeartbeatMailerNotConfiguredError,
  HeartbeatMailerSendError,
  ResendHeartbeatMailer,
  renderHeartbeatHtml,
} from "./resend-heartbeat-mailer";

/**
 * El adaptador de Resend del latido (tasks.md 27.5).
 *
 * Mismo mecanismo y misma forma que `resend-lifecycle-mailer.ts`: el cliente
 * de Resend se inyecta doblado, y nunca sale un correo de acá.
 */
function fakeResend(result: { error: { message: string } | null }) {
  const send = vi.fn().mockResolvedValue(result);
  return { send, client: { emails: { send } } as never };
}

const MESSAGE = {
  to: "fundador@rentoru.com",
  subject: "El latido no encontró la base viva",
  body: "https://rentoru.com/api/health respondió con 503.\n\nRevisá el panel de Neon.",
};

describe("configuración", () => {
  it("no se deja construir sin clave", () => {
    expect(() => new ResendHeartbeatMailer(undefined, "latido@rentoru.com")).toThrow(
      HeartbeatMailerNotConfiguredError,
    );
  });

  it("no se deja construir sin remitente", () => {
    expect(() => new ResendHeartbeatMailer("re_loquesea", undefined)).toThrow(
      HeartbeatMailerNotConfiguredError,
    );
  });
});

describe("el envío", () => {
  it("manda el asunto y el cuerpo que compuso el dominio, sin reescribirlos", async () => {
    const { send, client } = fakeResend({ error: null });

    await new ResendHeartbeatMailer("re_loquesea", "latido@rentoru.com", client).send(MESSAGE);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "latido@rentoru.com",
        to: MESSAGE.to,
        subject: MESSAGE.subject,
        text: MESSAGE.body,
      }),
    );
  });

  it("convierte en excepción el error que Resend devuelve", async () => {
    const { client } = fakeResend({ error: { message: "domain is not verified" } });
    const mailer = new ResendHeartbeatMailer("re_loquesea", "latido@rentoru.com", client);

    await expect(mailer.send(MESSAGE)).rejects.toThrow(HeartbeatMailerSendError);
    await expect(mailer.send(MESSAGE)).rejects.toThrow("domain is not verified");
  });
});

describe("el HTML, que es presentación y no redacción", () => {
  it("parte el cuerpo en párrafos sin agregar ni una palabra", () => {
    const html = renderHeartbeatHtml(MESSAGE.body);

    expect(html).toContain("<p>https://rentoru.com/api/health respondió con 503.</p>");
    expect(html).toContain("Revisá el panel de Neon.");
  });

  it("escapa lo que traería un status inesperado", () => {
    const html = renderHeartbeatHtml('respondió <script>alert("x")</script>');

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
