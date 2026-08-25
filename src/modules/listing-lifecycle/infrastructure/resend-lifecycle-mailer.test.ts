import { describe, expect, it, vi } from "vitest";
import {
  LifecycleMailerNotConfiguredError,
  LifecycleMailerSendError,
  ResendLifecycleMailer,
  renderLifecycleHtml,
} from "./resend-lifecycle-mailer";

/**
 * El adaptador de Resend (tasks.md 7.11).
 *
 * **Nunca sale un correo de acá.** El cliente de Resend se inyecta doblado: lo
 * que se prueba es qué le pasa el adaptador y qué hace con lo que le
 * devuelve, no la red de un tercero.
 */
function fakeResend(result: { error: { message: string } | null }) {
  const send = vi.fn().mockResolvedValue(result);
  return { send, client: { emails: { send } } as never };
}

const MESSAGE = {
  to: "duenio@ejemplo.com",
  subject: "Tu aviso vence en 3 días",
  body: "Hola.\n\nTu aviso «Apartamento en Chacao» vence pronto.\nRenovalo acá.",
};

describe("configuración", () => {
  /**
   * **Falla cerrado, igual que la puerta del cron.** Un adaptador que aceptara
   * la tanda sin proveedor perdería doscientos correos en silencio, y el caso
   * de uso los contaría como enviados: sabe contar fallas de envío, no sabe
   * enterarse de que nunca hubo proveedor.
   */
  it("no se deja construir sin clave", () => {
    expect(() => new ResendLifecycleMailer(undefined, "avisos@rentas.com.ve")).toThrow(
      LifecycleMailerNotConfiguredError,
    );
  });

  /**
   * Sin remitente, Resend rebota todo. Es una falla de configuración y tiene
   * que verse al arrancar, no en el primer correo del día siguiente.
   */
  it("no se deja construir sin remitente", () => {
    expect(() => new ResendLifecycleMailer("re_loquesea", undefined)).toThrow(
      LifecycleMailerNotConfiguredError,
    );
  });
});

describe("el envío", () => {
  it("manda el asunto y el cuerpo que compuso el dominio, sin reescribirlos", async () => {
    const { send, client } = fakeResend({ error: null });

    await new ResendLifecycleMailer("re_loquesea", "avisos@rentas.com.ve", client).send(MESSAGE);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "avisos@rentas.com.ve",
        to: MESSAGE.to,
        subject: MESSAGE.subject,
        // El texto plano es el del dominio tal cual: es lo que ve quien lee
        // el correo en una terminal o con las imágenes apagadas.
        text: MESSAGE.body,
      }),
    );
  });

  /**
   * **Resend DEVUELVE el error, no lo tira.** Un `await` sin mirar `error`
   * deja la tanda contando como enviados correos que rebotaron — y el caso de
   * uso sólo devuelve la reserva del libro si esto tira, así que ese envío
   * nunca se reintentaría.
   */
  it("convierte en excepción el error que Resend devuelve", async () => {
    const { client } = fakeResend({ error: { message: "domain is not verified" } });
    const mailer = new ResendLifecycleMailer("re_loquesea", "avisos@rentas.com.ve", client);

    await expect(mailer.send(MESSAGE)).rejects.toThrow(LifecycleMailerSendError);
    // El motivo del proveedor viaja: "el correo falló" sin la causa obliga a
    // adivinar entre una clave vencida y un dominio sin verificar.
    await expect(mailer.send(MESSAGE)).rejects.toThrow("domain is not verified");
  });
});

describe("el HTML, que es presentación y no redacción", () => {
  it("parte el cuerpo en párrafos sin agregar ni una palabra", () => {
    const html = renderLifecycleHtml(MESSAGE.body);

    expect(html).toContain("<p>Hola.</p>");
    expect(html).toContain("Renovalo acá.");
    // Los saltos simples quedan dentro del mismo párrafo.
    expect(html).toContain("<br />");
  });

  /**
   * **El título del aviso lo escribió una persona y viaja adentro de este
   * HTML.** Sin escapar, quien publica decide qué se dibuja en el correo de
   * otro — y el correo sale con nuestro remitente.
   */
  it("escapa lo que viene del aviso", () => {
    const html = renderLifecycleHtml('Tu aviso <script>alert("x")</script> vence');

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("no deja párrafos vacíos cuando el dominio separa con varios saltos", () => {
    expect(renderLifecycleHtml("Uno.\n\n\n\nDos.")).toBe(renderLifecycleHtml("Uno.\n\nDos."));
  });
});
