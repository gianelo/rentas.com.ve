import { describe, expect, it, vi } from "vitest";
import {
  ContactMailerNotConfiguredError,
  ContactMailerSendError,
  ResendContactMailer,
  renderContactHtml,
} from "./resend-contact-mailer";

/**
 * El adaptador de Resend de "Escribinos" (tasks.md 23.7).
 *
 * **Nunca sale un correo de acá.** Mismo doblez que `resend-lifecycle-mailer.test.ts`
 * y `resend-mailer.test.ts`: el cliente de Resend se inyecta, así que lo que
 * se prueba es qué le pasa este adaptador y qué hace con lo que le devuelve.
 */
function fakeResend(result: { error: { message: string } | null }) {
  const send = vi.fn().mockResolvedValue(result);
  return { send, client: { emails: { send } } as never };
}

const MESSAGE = {
  subject: "Escribinos: mensaje de María Pérez",
  body: 'María Pérez <maria@example.com> escribió desde "Escribinos":\n\nHola, una pregunta.',
  replyTo: "maria@example.com",
};

describe("configuración", () => {
  /**
   * Falla cerrado, la misma forma que `AuthMailerNotConfiguredError` y
   * `LifecycleMailerNotConfiguredError` ya usan (tasks.md 23.7 lo pide
   * explícitamente): sin alguno de los tres, el mensaje no sale y NO se
   * finge enviado.
   */
  it("no se deja construir sin clave", () => {
    expect(
      () => new ResendContactMailer(undefined, "ingresa@rentas.com.ve", "hola@rentas.com.ve"),
    ).toThrow(ContactMailerNotConfiguredError);
  });

  it("no se deja construir sin remitente (AUTH_MAIL_FROM, reusado)", () => {
    expect(() => new ResendContactMailer("re_loquesea", undefined, "hola@rentas.com.ve")).toThrow(
      ContactMailerNotConfiguredError,
    );
  });

  it("no se deja construir sin destino (CONTACT_MAIL_TO, la variable nueva de 23.7)", () => {
    expect(
      () => new ResendContactMailer("re_loquesea", "ingresa@rentas.com.ve", undefined),
    ).toThrow(ContactMailerNotConfiguredError);
  });
});

describe("el envío", () => {
  it("manda al destino configurado, con el remitente reusado y el replyTo del visitante", async () => {
    const { send, client } = fakeResend({ error: null });

    await new ResendContactMailer(
      "re_loquesea",
      "ingresa@rentas.com.ve",
      "hola@rentas.com.ve",
      client,
    ).send(MESSAGE);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "ingresa@rentas.com.ve",
        // El destino lo fija la infraestructura, nunca el mensaje: el
        // puerto (`ContactMailerPort`) ni siquiera tiene un campo `to`.
        to: "hola@rentas.com.ve",
        replyTo: MESSAGE.replyTo,
        subject: MESSAGE.subject,
        text: MESSAGE.body,
      }),
    );
  });

  it("convierte en excepción el error que Resend devuelve, sin fingir que se mandó", async () => {
    const { client } = fakeResend({ error: { message: "domain is not verified" } });
    const mailer = new ResendContactMailer(
      "re_loquesea",
      "ingresa@rentas.com.ve",
      "hola@rentas.com.ve",
      client,
    );

    await expect(mailer.send(MESSAGE)).rejects.toThrow(ContactMailerSendError);
    await expect(mailer.send(MESSAGE)).rejects.toThrow("domain is not verified");
  });
});

describe("el HTML, que es presentación y no redacción", () => {
  it("parte el cuerpo en párrafos sin agregar ni una palabra", () => {
    const html = renderContactHtml(MESSAGE.body);

    expect(html).toContain("<p>Hola, una pregunta.</p>");
  });

  /** El nombre y el mensaje los escribió quien completó el formulario. */
  it("escapa lo que escribió el visitante", () => {
    const html = renderContactHtml('Mensaje: <script>alert("x")</script>');

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
