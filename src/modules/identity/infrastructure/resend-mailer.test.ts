import { describe, expect, it, vi } from "vitest";
import {
  AuthMailerNotConfiguredError,
  AuthMailerSendError,
  ResendMailer,
  readAuthMailerConfig,
  renderAuthMailHtml,
} from "./resend-mailer";

/**
 * El adaptador de Resend de `identity` (tasks.md 15.2).
 *
 * **Nunca sale un correo de acá.** El cliente de Resend se inyecta doblado,
 * igual que en `listing-lifecycle/infrastructure/resend-lifecycle-mailer.test.ts`
 * — lo que se prueba es qué le pasa el adaptador y qué hace con lo que le
 * devuelve, no la red de un tercero.
 */
function fakeResend(result: { error: { message: string } | null }) {
  const send = vi.fn().mockResolvedValue(result);
  return { send, client: { emails: { send } } as never };
}

const MESSAGE = {
  to: "tenant@ejemplo.com",
  subject: "Tu enlace para entrar a Rentas",
  body: "Entrá con este enlace:\nhttps://rentas.com.ve/api/auth/callback/email?token=x",
};

describe("configuración", () => {
  it("no se deja construir sin clave", () => {
    expect(() => new ResendMailer(undefined, "ingresa@rentas.com.ve")).toThrow(
      AuthMailerNotConfiguredError,
    );
  });

  it("no se deja construir sin remitente", () => {
    expect(() => new ResendMailer("re_loquesea", undefined)).toThrow(AuthMailerNotConfiguredError);
  });
});

describe("readAuthMailerConfig", () => {
  // Igual que readMailerConfig (listing-lifecycle/infrastructure/lifecycle-config.ts):
  // las dos o ninguna. Media configuración deja a quien llama construyendo un
  // adaptador que falla en el primer envío.
  it("devuelve undefined si falta la clave", () => {
    expect(
      readAuthMailerConfig({ RESEND_API_KEY: undefined, AUTH_MAIL_FROM: "ingresa@rentas.com.ve" }),
    ).toBeUndefined();
  });

  it("devuelve undefined si falta el remitente", () => {
    expect(
      readAuthMailerConfig({ RESEND_API_KEY: "re_loquesea", AUTH_MAIL_FROM: undefined }),
    ).toBeUndefined();
  });

  it("devuelve las dos cuando ambas están", () => {
    expect(
      readAuthMailerConfig({
        RESEND_API_KEY: "re_loquesea",
        AUTH_MAIL_FROM: "ingresa@rentas.com.ve",
      }),
    ).toEqual({ apiKey: "re_loquesea", from: "ingresa@rentas.com.ve" });
  });
});

describe("el envío", () => {
  it("manda el asunto y el cuerpo que compuso el dominio, sin reescribirlos", async () => {
    const { send, client } = fakeResend({ error: null });

    await new ResendMailer("re_loquesea", "ingresa@rentas.com.ve", client).send(MESSAGE);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "ingresa@rentas.com.ve",
        to: MESSAGE.to,
        subject: MESSAGE.subject,
        text: MESSAGE.body,
      }),
    );
  });

  it("convierte en excepción el error que Resend devuelve", async () => {
    const { client } = fakeResend({ error: { message: "domain is not verified" } });
    const mailer = new ResendMailer("re_loquesea", "ingresa@rentas.com.ve", client);

    await expect(mailer.send(MESSAGE)).rejects.toThrow(AuthMailerSendError);
    await expect(mailer.send(MESSAGE)).rejects.toThrow("domain is not verified");
  });
});

describe("el HTML, que es presentación y no redacción", () => {
  it("parte el cuerpo en párrafos sin agregar ni una palabra", () => {
    const html = renderAuthMailHtml(MESSAGE.body);

    expect(html).toContain("Entrá con este enlace:");
  });

  it("escapa lo que viene del cuerpo", () => {
    const html = renderAuthMailHtml('<script>alert("x")</script>');

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
